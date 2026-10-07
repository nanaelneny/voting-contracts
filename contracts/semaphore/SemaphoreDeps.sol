// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Not a contract of ours: these imports make Hardhat compile Semaphore's
// contracts so tests and scripts/deployV2.js can deploy them on a local chain.
// On public networks you can reuse Semaphore's official deployment instead.
import {Semaphore} from "@semaphore-protocol/contracts/Semaphore.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
