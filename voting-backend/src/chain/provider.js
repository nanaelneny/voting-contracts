const { JsonRpcProvider } = require("ethers");

/**
 * A blockchain connection with ethers' response cache turned off.
 *
 * By default ethers reuses identical RPC responses for 250 ms. When the backend
 * sends transactions back to back (e.g. publishing an election), that hands the
 * second transaction a stale nonce and the node rejects it ("nonce too low").
 * It would also show a stale election phase right after voting opens or closes.
 */
function createProvider(rpcUrl) {
  return new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
}

module.exports = { createProvider };
