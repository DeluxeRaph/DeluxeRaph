const fs = require("fs");

const readmePath = "README.md";
const login = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;

if (!login) {
  throw new Error("GITHUB_USERNAME or GITHUB_REPOSITORY_OWNER is required.");
}

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

const query = `
  query Contributions($login: String!) {
    user(login: $login) {
      contributionsCollection {
        commitContributionsByRepository(maxRepositories: 50) {
          repository {
            nameWithOwner
            url
            stargazerCount
          }
          contributions {
            totalCount
          }
        }
        pullRequestContributionsByRepository(maxRepositories: 50) {
          repository {
            nameWithOwner
            url
            stargazerCount
          }
          contributions {
            totalCount
          }
        }
        issueContributionsByRepository(maxRepositories: 50) {
          repository {
            nameWithOwner
            url
            stargazerCount
          }
          contributions {
            totalCount
          }
        }
        pullRequestReviewContributionsByRepository(maxRepositories: 50) {
          repository {
            nameWithOwner
            url
            stargazerCount
          }
          contributions {
            totalCount
          }
        }
      }
    }
  }
`;

function addContribution(repos, item, kind) {
  const repo = item.repository;
  const count = item.contributions.totalCount;

  if (!repo || !count || repo.nameWithOwner.toLowerCase() === `${login}/${login}`.toLowerCase()) {
    return;
  }

  if (!repos.has(repo.nameWithOwner)) {
    repos.set(repo.nameWithOwner, {
      nameWithOwner: repo.nameWithOwner,
      url: repo.url,
      stars: repo.stargazerCount,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
    });
  }

  repos.get(repo.nameWithOwner)[kind] += count;
}

function formatContributionSummary(repo) {
  const parts = [
    ["commit", "commits", repo.commits],
    ["PR", "PRs", repo.pullRequests],
    ["issue", "issues", repo.issues],
    ["review", "reviews", repo.reviews],
  ]
    .filter(([, , count]) => count > 0)
    .map(([singular, plural, count]) => `${count} ${count === 1 ? singular : plural}`);

  return parts.join(", ");
}

async function githubGraphql() {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "profile-readme-updater",
    },
    body: JSON.stringify({ query, variables: { login } }),
  });

  const body = await response.json();

  if (!response.ok || body.errors) {
    throw new Error(JSON.stringify(body.errors || body, null, 2));
  }

  return body.data.user.contributionsCollection;
}

function updateReadme(repos) {
  const rankedRepos = [...repos.values()]
    .sort((a, b) => b.stars - a.stars || a.nameWithOwner.localeCompare(b.nameWithOwner))
    .slice(0, 5);

  const generated = rankedRepos.length
    ? rankedRepos
        .map((repo) => {
          const summary = formatContributionSummary(repo);
          return `        <li><a href="${repo.url}">${repo.nameWithOwner}</a> - ${repo.stars.toLocaleString()} stars; ${summary}</li>`;
        })
        .join("\n")
    : "        <li>No public contributions found yet.</li>";

  const readme = fs.readFileSync(readmePath, "utf8");
  const markerPattern = /        <!-- OPEN-SOURCE-START -->[\s\S]*?        <!-- OPEN-SOURCE-END -->/;

  if (!markerPattern.test(readme)) {
    throw new Error("Open source markers were not found in README.md.");
  }

  const nextReadme = readme.replace(
    markerPattern,
    `        <!-- OPEN-SOURCE-START -->\n${generated}\n        <!-- OPEN-SOURCE-END -->`,
  );

  fs.writeFileSync(readmePath, nextReadme);
}

async function main() {
  const contributions = await githubGraphql();
  const repos = new Map();

  contributions.commitContributionsByRepository.forEach((item) => addContribution(repos, item, "commits"));
  contributions.pullRequestContributionsByRepository.forEach((item) => addContribution(repos, item, "pullRequests"));
  contributions.issueContributionsByRepository.forEach((item) => addContribution(repos, item, "issues"));
  contributions.pullRequestReviewContributionsByRepository.forEach((item) => addContribution(repos, item, "reviews"));

  updateReadme(repos);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
