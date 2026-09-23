Resend a Line Dispatch# Runbook — Resend a Line Dispatch
## Context
This runbook describes how to manually re-trigger a line dispatch event when the normal flow has failed or needs to be replayed.
The operation involves **two services** used in sequence:
1. **documents-storage** — used to retrieve the goods receiving data and generate the dispatch payload via a trigger endpoint (`/run/generate/sendLinesDispatchV3`)
2. **documents-adapter** — used to actually publish the Kafka event via `/api/v1/external-goods-receiving/sendLinesDispatched`

## Step 1 — Set up documents-storage
### 1.1 Switch to the hotfix branch
git checkout hotfix/ISOIAA-4234

### 1.2 Configure production credentials
In the .env file at the root of `documents-storage/`, set the correct **production** database and service credentials.
> The .env file is not committed. Retrieve credentials from vault or ask the team.
### 1.3 Start the service locally (without migration)
The default `npm start` script runs database migrations before starting:
"start": "npx sequelize db:migrate && nest start"

**Remove the migration step** before starting to avoid running migrations against production. Run directly:
nest start or npx nest start

> The Swagger UI is available at: `http://localhost:<port>/api`

## Step 2 — Retrieve the dispatch payload from documents-storage
### Endpoint
POST /run/generate/sendLinesDispatchV3
> This endpoint is specific to the hotfix/ISOIAA-4234 branch and is not present in the main branch.

### Request body


{
  "goodsReceivingId": "<string>",
  "externalId": "<string>",
  "acdc": true
}

### What to do with the response
This endpoint returns the full body needed for the next step. Copy the full response payload — it will be used as the body for the documents-adapter call.

## Step 3 — Publish the event via documents-adapter
### Endpoint
POST /api/v1/external-goods-receiving/sendLinesDispatched

- **HTTP Method:** POST
- **Expected response:** 204 No Content
- **Swagger UI:** http://localhost:<port>/api
### Request body
Paste the payload copied from Step 2. Full example:

{
  "goodsReceivingIdentifier": "1787608",
  "technicalAccountIdentifier": "40005323",
  "deliveryLocation": {
    "businessUnitIdentifier": "005",
    "deliveryLocationIdentifier": "061",
    "deliveryLocationType": "STORE"
  },
  "goodsReceivingLines": [
    {
      "identifier": 61783839,
      "goodsReceivingContainers": [
        {
          "goodsReceivingContainerIdentifier": "1787608-180000506100260270",
          "goodsReceivingContainerSSCCNumber": "180000506100260270",
          "logisticZone": {
            "identifier": "GTAB",
            "type": "GOODS_TAKEAWAY_BUFFER"
          },
          "goodsReceivingContainerQuantity": 5
        }
      ],
      "productReferenceBU": "98964853",
      "productReferenceAdeo": null,
      "quantity": 5,
      "distributionOrderLongIdentifier": null,
      "distributionOrderLineIdentifier": null,
      "inboundOrderLongIdentifier": "260130132438877-63305275",
      "inboundOrderLineIdentifier": "1",
      "transferLongIdentifier": null,
      "transferLineIdentifier": null,
      "customerOrderCartItem": null,
      "additionalDescription": null
    }
  ]
}

