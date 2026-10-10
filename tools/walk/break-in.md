# Break-in test — one company asking for another company's data

Signed in as the demo company. Control passed: it can read its own job, so a refusal below is real.

**156 requests · 0 leaks · 156 refused / empty · 2 refused with a server error**

| Request | Result |
|---|---|
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/projects/:other` | ✅ refused (404) |
| `/api/projects/:other/bills` | ✅ refused (404) |
| `/api/projects/:other/budget` | ✅ refused (404) |
| `/api/projects/:other/invoices` | ✅ refused (404) |
| `/api/projects/:other/todos` | ✅ refused (404) |
| `/api/projects/:other/closeout` | ✅ refused (404) |
| `/api/projects/:other/commissioning` | ✅ refused (404) |
| `/api/projects/:other/coordination-issues` | ✅ refused (404) |
| `/api/projects/:other/folders` | ✅ refused (404) |
| `/api/projects/:other/incidents` | ✅ refused (404) |
| `/api/projects/:other/permits` | ✅ refused (404) |
| `/api/projects/:other/purchase-orders` | ✅ refused (404) |
| `/api/projects/:other/specs` | ✅ refused (404) |
| `/api/projects/:other/submittals` | ✅ refused (404) |
| `/api/projects/:other/waste-tracking` | ✅ refused (404) |
| `/api/projects/:other/daily-logs` | ✅ refused (404) |
| `/api/projects/:other/photos/link` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/punch-list/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/photos/list?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/rfis?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoff?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/takeoffs/latest?projectId=:other` | ✅ 200 with none of the other company's rows |
| `/api/daily-logs/:other` | ✅ refused (404) |
| `/api/daily-logs/:other` | ✅ refused (404) |
| `/api/rfis/:other` | ✅ server error 500 — no data, but fix the error |
| `/api/rfis/:other` | ✅ server error 500 — no data, but fix the error |
| `/api/change-orders/:other` | ✅ refused (404) |
| `/api/change-orders/:other` | ✅ refused (404) |
| `/api/pay-apps/:other` | ✅ refused (404) |
| `/api/pay-apps/:other` | ✅ refused (404) |
| `/api/contracts/:other` | ✅ refused (404) |
| `/api/contracts/:other` | ✅ refused (404) |
| `/api/inspections/:other` | ✅ refused (404) |
| `/api/inspections/:other` | ✅ refused (404) |
| `/api/invoices/:other` | ✅ refused (404) |
| `/api/invoices/:other` | ✅ refused (404) |
| `/api/bid-packages/:other` | ✅ refused (404) |
| `/api/bid-packages/:other` | ✅ refused (404) |
| `/api/takeoff/:other` | ✅ refused (404) |
| `/api/takeoff/:other` | ✅ refused (404) |
