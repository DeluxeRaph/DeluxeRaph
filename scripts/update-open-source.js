const fs = require("fs");

const readmePath = "README.md";
const login = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;
const maxPages = Number(process.env.MAX_PR_SEARCH_PAGES || 5);

if (!login) {
  throw new Error("GITHUB_USERNAME or GITHUB_REPOSITORY_OWNER is required.");
}

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const query = `
  query MergedPullRequests($query: String!, $cursor: String) {
    search(query: $query, type: ISSUE, first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          title
          url
          mergedAt
          repository {
            nameWithOwner
            url
            stargazerCount
          }
        }
      }
    }
  }
`;

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function badgeUrl(label, message, color) {
  const encodedLabel = encodeURIComponent(label);
  const encodedMessage = encodeURIComponent(message);

  return `https://img.shields.io/badge/${encodedLabel}-${encodedMessage}-${color}?style=flat-square`;
}

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

function addMergedPullRequest(repos, pullRequest) {
  const repo = pullRequest.repository;

  if (!repo || repo.nameWithOwner.toLowerCase() === `${login}/${login}`.toLowerCase()) {
    return;
  }

  if (!repos.has(repo.nameWithOwner)) {
    repos.set(repo.nameWithOwner, {
      nameWithOwner: repo.nameWithOwner,
      url: repo.url,
      stars: repo.stargazerCount,
      mergedPullRequests: [],
    });
  }

  repos.get(repo.nameWithOwner).mergedPullRequests.push({
    title: pullRequest.title,
    url: pullRequest.url,
    mergedAt: pullRequest.mergedAt,
  });
}

async function githubGraphql(searchQuery, cursor) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "profile-readme-updater",
    },
    body: JSON.stringify({ query, variables: { query: searchQuery, cursor } }),
  });

  const body = await response.json();

  if (!response.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body, null, 2));
  }

  return body.data.search;
}

async function getMergedPullRequests() {
  const searchQuery = `author:${login} is:pr is:merged -user:${login}`;
  const pullRequests = [];
  let cursor = null;

  for (let page = 0; page < maxPages; page += 1) {
    const search = await githubGraphql(searchQuery, cursor);
    pullRequests.push(...search.nodes.filter(Boolean));

    if (!search.pageInfo.hasNextPage) {
      break;
    }

    cursor = search.pageInfo.endCursor;
  }

  return pullRequests;
}

function updateReadme(repos) {
  const rankedRepos = [...repos.values()]
    .sort((a, b) => b.stars - a.stars || a.nameWithOwner.localeCompare(b.nameWithOwner))
    .slice(0, 5);

  const generated = rankedRepos.length
    ? rankedRepos
        .map((repo) => {
          const latestPullRequest = repo.mergedPullRequests.sort(
            (a, b) => new Date(b.mergedAt) - new Date(a.mergedAt),
          )[0];
          const starsBadge = badgeUrl("stars", repo.stars.toLocaleString(), "f7b731");
          const mergedLabel = pluralize(repo.mergedPullRequests.length, "merged PR", "merged PRs");
          const mergedBadge = badgeUrl(mergedLabel, repo.mergedPullRequests.length.toLocaleString(), "2ea44f");

          return [
            "  <tr>",
            `    <td><strong><a href="${repo.url}">${repo.nameWithOwner}</a></strong></td>`,
            `    <td><img src="${starsBadge}" alt="${repo.stars.toLocaleString()} stars" /></td>`,
            `    <td><img src="${mergedBadge}" alt="${repo.mergedPullRequests.length.toLocaleString()} ${mergedLabel}" /></td>`,
            `    <td><a href="${latestPullRequest.url}">${escapeHtml(latestPullRequest.title)}</a></td>`,
            "  </tr>",
          ].join("\n");
        })
        .join("\n")
    : '      <p>No public merged pull requests found yet.</p>';

  const table = rankedRepos.length
    ? [
        "<table>",
        "  <tr>",
        "    <th>Repository</th>",
        "    <th>Stars</th>",
        "    <th>Merged</th>",
        "    <th>Latest merged PR</th>",
        "  </tr>",
        generated,
        "</table>",
      ].join("\n")
    : generated;

  const readme = fs.readFileSync(readmePath, "utf8");
  const markerPattern = /<!-- OPEN-SOURCE-START -->[\s\S]*?<!-- OPEN-SOURCE-END -->/;

  if (!markerPattern.test(readme)) {
    throw new Error("Open source markers were not found in README.md.");
  }

  const nextReadme = readme.replace(
    markerPattern,
    `<!-- OPEN-SOURCE-START -->\n${table}\n<!-- OPEN-SOURCE-END -->`,
  );

  fs.writeFileSync(readmePath, nextReadme);
}

async function main() {
  const pullRequests = await getMergedPullRequests();
  const repos = new Map();

  pullRequests.forEach((pullRequest) => addMergedPullRequest(repos, pullRequest));

  updateReadme(repos);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
