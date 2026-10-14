const { JsonRpcProvider } = require("ethers");

// Signs that the connection to the RPC server failed, rather than the request itself
// being refused (e.g. "read ECONNRESET" when a free public server drops the connection).
const NETWORK_TROUBLE = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|socket hang up|network|timeout|502|503|504/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A blockchain connection that:
 *
 * 1. Has ethers' response cache turned off. By default ethers reuses identical RPC
 *    responses for 250 ms. When the backend sends transactions back to back (e.g.
 *    publishing an election), that hands the second transaction a stale nonce and the
 *    node rejects it ("nonce too low"). It would also show a stale election phase right
 *    after voting opens or closes.
 *
 * 2. Tries again when the connection drops. Free public RPC servers sometimes cut a
 *    connection mid-request. Asking again is safe for everything except sending a
 *    transaction, so those are never repeated here (repeating one is handled by the
 *    callers, who check what actually happened on-chain).
 */
class ResilientProvider extends JsonRpcProvider {
  constructor(url, { retries = 4 } = {}) {
    super(url, undefined, { cacheTimeout: -1 });
    this.retries = retries;
  }

  async _send(payload) {
    const list = Array.isArray(payload) ? payload : [payload];
    const sendsTransaction = list.some((p) => p.method === "eth_sendRawTransaction");
    for (let attempt = 0; ; attempt++) {
      try {
        return await super._send(payload);
      } catch (err) {
        const trouble = NETWORK_TROUBLE.test(`${err.code || ""} ${err.message || ""}`);
        if (!trouble || sendsTransaction || attempt >= this.retries) throw err;
        await sleep(500 * 2 ** attempt); // 0.5 s, 1 s, 2 s, 4 s
      }
    }
  }
}

function createProvider(rpcUrl, options) {
  return new ResilientProvider(rpcUrl, options);
}

module.exports = { createProvider, ResilientProvider };
