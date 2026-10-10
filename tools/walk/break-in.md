# Break-in test — one company asking for another company's data

Signed in as the demo company. Control passed: it can read its own job, so a refusal below is real.

**68 requests · 15 leaks · 49 refused / empty · 0 refused with a server error**

| Request | Result |
|---|---|
| `/api/projects/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/projects/:other/bills` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/budget` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/invoices` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/todos` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/closeout` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/commissioning` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/coordination-issues` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/folders` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/incidents` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/permits` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/purchase-orders` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/specs` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/submittals` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/waste-tracking` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/daily-logs` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/projects/:other/bills` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/budget` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/invoices` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/todos` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/closeout` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/commissioning` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/coordination-issues` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/folders` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/incidents` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/permits` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/purchase-orders` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/specs` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/submittals` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/waste-tracking` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/daily-logs` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ⚠️ skipped — that job belongs to the signed-in company |
| `/api/projects/:other` | ⚠️ skipped — that job belongs to the signed-in company |
| `/api/projects/:other` | ⚠️ skipped — that job belongs to the signed-in company |
| `/api/projects/:other` | ⚠️ skipped — that job belongs to the signed-in company |
| `/api/daily-logs/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/daily-logs/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/rfis/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/rfis/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/change-orders/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/change-orders/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/pay-apps/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/pay-apps/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/contracts/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/contracts/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/inspections/:other` | ✅ refused (404) |
| `/api/inspections/:other` | ✅ refused (404) |
| `/api/invoices/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/invoices/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/bid-packages/:other` | ✅ refused (404) |
| `/api/bid-packages/:other` | ❌ LEAK — 200 and the answer contains the other company's id |
| `/api/takeoff/:other` | ✅ refused (404) |
| `/api/takeoff/:other` | ✅ refused (404) |
