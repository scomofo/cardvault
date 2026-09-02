import test from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/testServer.js";

test("identification routes support three-phase identification and learning workflow", async (t) => {
  const { baseUrl } = await startTestServer(t, { dirPrefix: "cardvault-identification-" });

  const knownItem = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ident-known",
      name: "Wayne Gretzky",
      playerName: "Wayne Gretzky",
      manufacturer: "O-Pee-Chee",
      set: "Platinum",
      year: "2018",
      number: "50",
      parallel: "Red Prism",
      marketPrice: 85,
      frontImgId: "front-known",
      backImgId: "back-known",
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(knownItem.status, 201);

  const identifyResponse = await fetch(`${baseUrl}/api/identification/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId: "ident-known",
      ocrText: "2018 O-Pee-Chee Platinum Wayne Gretzky #50 Red Prism",
      visualSearchResult: {
        name: "Wayne Gretzky",
        set: "Platinum",
        year: "2018",
        number: "50",
        rarity: "base",
        parallel: "Red Prism",
        type: "sports",
        confidence: "high",
      },
    }),
  });
  assert.equal(identifyResponse.status, 200);
  const identifyPayload = await identifyResponse.json();
  assert.equal(identifyPayload.result.recommendation, "auto_accept_match");
  assert.equal(identifyPayload.result.finalCatalogCardId, null);
  assert.ok(Array.isArray(identifyPayload.candidates));
  assert.ok(identifyPayload.candidates.length >= 1);

  const confirmResponse = await fetch(`${baseUrl}/api/identification/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId: "ident-known",
      identificationResultId: identifyPayload.result.id,
      acceptedBy: "user",
    }),
  });
  assert.equal(confirmResponse.status, 200);
  const confirmedExample = await confirmResponse.json();
  assert.equal(confirmedExample.item_id, "ident-known");
  assert.ok(confirmedExample.final_catalog_card_id);
  const confirmedCatalogCardId = confirmedExample.final_catalog_card_id;

  const similarityUpdateResponse = await fetch(
    `${baseUrl}/api/identification/similarity/ident-known`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
  );
  assert.equal(similarityUpdateResponse.status, 200);

  const similarityResponse = await fetch(`${baseUrl}/api/identification/similarity/ident-known`);
  assert.equal(similarityResponse.status, 200);
  const similarExamples = await similarityResponse.json();
  assert.ok(Array.isArray(similarExamples));

  const datasetResponse = await fetch(`${baseUrl}/api/identification/dataset`);
  assert.equal(datasetResponse.status, 200);
  const dataset = await datasetResponse.json();
  assert.ok(dataset.some((entry) => entry.item_id === "ident-known"));

  const unknownItem = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "ident-unknown",
      name: "Mystery Card",
      listedOn: [],
      priceHistory: [],
    }),
  });
  assert.equal(unknownItem.status, 201);

  const unresolvedResponse = await fetch(`${baseUrl}/api/identification/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itemId: "ident-unknown",
      ocrText: "mystery cardboard relic with no readable checklist clues",
    }),
  });
  assert.equal(unresolvedResponse.status, 200);
  const unresolvedPayload = await unresolvedResponse.json();
  assert.equal(unresolvedPayload.result.recommendation, "unresolved");

  const correctionResponse = await fetch(`${baseUrl}/api/identification/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identificationResultId: unresolvedPayload.result.id,
      correctedCatalogCardId: confirmedCatalogCardId,
      reason: "Matched by manual set and player verification",
    }),
  });
  assert.equal(correctionResponse.status, 200);
  const correctedResult = await correctionResponse.json();
  assert.equal(correctedResult.correction_flag, 1);

  const hardCasesResponse = await fetch(`${baseUrl}/api/identification/hard-cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  assert.equal(hardCasesResponse.status, 200);
  const hardCases = await hardCasesResponse.json();
  assert.ok(Array.isArray(hardCases));
});
