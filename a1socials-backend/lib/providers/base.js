// Every provider adapter (SMM panel, game top-up aggregator, etc.) must implement
// these two methods so the rest of the app doesn't care which upstream API it's calling.

class BaseProvider {
  constructor(config) {
    this.config = config; // { base_url, api_key, api_secret }
  }

  // Place an order with the upstream provider.
  // Must return: { success: boolean, providerOrderId: string|null, raw: object }
  async placeOrder(order, service) {
    throw new Error('placeOrder() not implemented for this provider');
  }

  // Check the status of a previously placed order.
  // Must return: { status: 'processing'|'completed'|'failed', raw: object }
  async checkStatus(providerOrderId) {
    throw new Error('checkStatus() not implemented for this provider');
  }
}

module.exports = BaseProvider;
