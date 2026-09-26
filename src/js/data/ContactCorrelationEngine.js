/**
 * POLARIS Contact Correlation & Target Association Engine
 * Performs spatial/temporal correlation between catalogued USNIC icebergs, AIS vessels, and SAR contacts.
 * Assigns match status: NEW_SAR_CONTACT | MATCHED_TO_KNOWN_ICEBERG | MATCHED_TO_VESSEL | UNRESOLVED.
 */

import { SAR_VERIFICATION_STATUS } from './SarContactProvider.js';

export const CORRELATION_STATUS = {
  NEW_SAR_CONTACT: 'NEW_SAR_CONTACT',
  MATCHED_TO_KNOWN_ICEBERG: 'MATCHED_TO_KNOWN_ICEBERG',
  MATCHED_TO_VESSEL: 'MATCHED_TO_VESSEL',
  UNRESOLVED: 'UNRESOLVED'
};

export class ContactCorrelationEngine {
  constructor(maxCorrelationDistanceMeters = 3000) {
    this.maxDistanceSU = maxCorrelationDistanceMeters / 30; // Convert meters to world SU
  }

  /**
   * Correlate SAR contacts against known USNIC Icebergs & AIS Vessels
   * @param {Array} sarContacts 
   * @param {Array} cataloguedIcebergs 
   * @param {Array} vesselObservations 
   */
  correlate(sarContacts, cataloguedIcebergs = [], vesselObservations = []) {
    if (!Array.isArray(sarContacts)) return [];

    const correlatedResults = [];

    for (const contact of sarContacts) {
      let bestMatch = null;
      let minDistance = Infinity;
      let matchType = CORRELATION_STATUS.UNRESOLVED;

      // 1. Correlate with Catalogued USNIC Icebergs
      for (const ice of cataloguedIcebergs) {
        const iceX = ice.position ? ice.position.x : (ice.x || 0);
        const iceY = ice.position ? ice.position.y : (ice.y || 0);
        const dist = Math.hypot(contact.worldX - iceX, contact.worldY - iceY);
        if (dist < minDistance && dist <= this.maxDistanceSU) {
          minDistance = dist;
          bestMatch = ice;
          matchType = CORRELATION_STATUS.MATCHED_TO_KNOWN_ICEBERG;
        }
      }

      // 2. Correlate with Vessel Observations
      for (const vessel of vesselObservations) {
        const vPos = vessel.position || { x: vessel.x || 0, y: vessel.y || 0 };
        const dist = Math.hypot(contact.worldX - vPos.x, contact.worldY - vPos.y);
        if (dist < minDistance && dist <= this.maxDistanceSU) {
          minDistance = dist;
          bestMatch = vessel;
          matchType = CORRELATION_STATUS.MATCHED_TO_VESSEL;
        }
      }

      // 3. Assign correlation state
      const result = {
        ...contact,
        correlationStatus: matchType,
        matchedEntityId: bestMatch ? bestMatch.id : null,
        matchedEntityName: bestMatch ? (bestMatch.name || bestMatch.id) : null,
        correlationDistanceSU: minDistance < Infinity ? Math.round(minDistance) : null
      };

      if (matchType === CORRELATION_STATUS.MATCHED_TO_KNOWN_ICEBERG) {
        result.verification = SAR_VERIFICATION_STATUS.CORRELATED;
        result.classification = 'ICEBERG';
      } else if (matchType === CORRELATION_STATUS.MATCHED_TO_VESSEL) {
        result.verification = SAR_VERIFICATION_STATUS.CORRELATED;
        result.classification = 'SHIP';
      } else {
        result.verification = SAR_VERIFICATION_STATUS.UNVERIFIED;
      }

      correlatedResults.push(result);
    }

    return correlatedResults;
  }
}
