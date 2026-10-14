# Evaluation run: ethereum-sepolia

- Date: 2026-10-13T09:25:32.529Z
- Contract: `0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A` ([explorer](https://sepolia.etherscan.io/address/0x1f70F78E01aA49f5490BE6D6Be637C10ab51Bf5A))
- Election #2: 10 voters, 3 candidates
- Votes accepted: 10 of 10
- Double vote by the same voter: refused (AlreadyVoted), no transaction sent, cost 0 ETH
- Final tally: Ama Owusu 4, Kofi Mensah 3, Esi Boateng 3

## Per vote

| Measure | Mean | Median | 95th pct | Min | Max | Unit |
|---|---|---|---|---|---|---|
| Proof generation (Node.js) | 354 | 290 | 867 | 268 | 867 | ms |
| Submit → confirmed | 12673 | 12330 | 20144 | 7083 | 20144 | ms |
| Gas used | 560321 | 521161 | 716989 | 521125 | 716989 | gas |
| Fee paid by relayer | 0.0000005603 | 0.0000005212 | 0.0000007170 | 0.0000005211 | 0.0000007170 | ETH |

## Totals

| Item | Cost |
|---|---|
| Setup by admin (create election, 3 candidates, 10 voters) | 0.000003662962594967 ETH (≈ $0.009237) |
| All votes + finalize, paid by relayer | 0.000005861527366904 ETH (≈ $0.014781) |
| Paid by voters | 0 ETH |

USD figures assume 1 ETH = $2521.67. Test-network ETH has no real value; these show what the same transactions would cost at this gas price.

## Setup and finalize times

| Step | Time (ms) |
|---|---|
| createElection | 6556 |
| addCandidates | 10498 |
| addVoters (10) | 10546 |
| finalize | 11978 |
