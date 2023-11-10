# Using Hexadecimal Numbers in the EVM Stack

## Introduction

Hello, Readers

This document looks to provides a infromation on the proper hexadecimal number to use when working with low level Ethereum Virtual Machine (EVM). 
Understanding hexadecimal numbers and their usage is crucial for developers working with Ethereum smart contracts, 
as it's a fundamental part of how data is represented and manipulated in the EVM. 

I'll be using this as a resource to help me collect my thoughts while I'm lurking around in the lower levels.
The language I'll be lurking with is Huff.


### Msg.Value in Huff

- We need a way to receive the value, so we use the `callvalue` and add it to the stack.            [val]
- With the value in the stack we need a way to store the value into memory so it can be read it.
- 
