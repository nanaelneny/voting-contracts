// The blockchain connection should survive a server that drops connections.
const http = require("http");
const { expect } = require("chai");
const hre = require("hardhat");
const { JsonRpcServer } = require("hardhat/internal/hardhat-network/jsonrpc/server");
const { createProvider } = require("../../voting-backend/src/chain/provider");

describe("Blockchain connection", function () {
  let rpc, proxy, dropped;
  let dropNext = 0;

  before(async () => {
    rpc = new JsonRpcServer({ hostname: "127.0.0.1", port: 0, provider: hre.network.provider });
    const { port: rpcPort } = await rpc.listen();
    // A proxy in front of the node that can hang up on the next N requests,
    // like a busy free public RPC server ("read ECONNRESET").
    proxy = http.createServer((req, res) => {
      if (dropNext > 0) {
        dropNext--;
        dropped++;
        req.socket.destroy();
        return;
      }
      const upstream = http.request({ host: "127.0.0.1", port: rpcPort, method: req.method, path: req.url, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      req.pipe(upstream);
    });
    await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
  });

  after(async () => {
    proxy.close();
    await rpc.close();
  });

  it("tries again when the server drops the connection", async () => {
    const provider = createProvider(`http://127.0.0.1:${proxy.address().port}`);
    await provider.getNetwork();
    dropped = 0;
    dropNext = 2;
    const block = await provider.getBlockNumber();
    expect(block).to.be.a("number");
    expect(dropped).to.equal(2);
    provider.destroy();
  });

  it("gives up after a few tries", async () => {
    const provider = createProvider(`http://127.0.0.1:${proxy.address().port}`, { retries: 1 });
    await provider.getNetwork();
    dropNext = 5;
    let failed = false;
    try {
      await provider.getBlockNumber();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
    dropNext = 0;
    provider.destroy();
  });
});
