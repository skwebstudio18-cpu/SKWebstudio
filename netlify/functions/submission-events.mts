import { getDatabase } from '@netlify/database';
import { ingestRecord } from '../../server/portal/model.mjs';
import { PortalRepository } from '../../server/portal/repository.mjs';
export default {
  async formSubmitted(event) {
    // Netlify verifies event invocations; customer-supplied fields remain untrusted.
    const record = ingestRecord(event.data);
    if (record) await new PortalRepository(getDatabase().pool).ingest(record);
  }
};
