// Template adapter for a typical top-up/SMM aggregator API.
// Every aggregator (SEAGM, Yokcash, DigitalRC, or an SMM provider) has slightly
// different request/response shapes, so you WILL need to tweak the field names
// below to match whichever provider's docs you're integrating.
//
// This template assumes a common REST pattern:
//   POST {base_url}/order   -> place an order
//   GET  {base_url}/order/:id -> check status
// Swap the paths/fields for your chosen provider's actual API documentation.

const axios = require('axios');
const BaseProvider = require('./base');

class GenericAggregator extends BaseProvider {
  async placeOrder(order, service) {
    try {
      const response = await axios.post(
        `${this.config.base_url}/order`,
        {
          api_key: this.config.api_key,
          sku: service.provider_sku,
          quantity: order.quantity,
          player_id: order.player_id || undefined,
          zone_id: order.zone_id || undefined,
          target: order.target_link || undefined, // for SMM: profile/post link
        },
        { timeout: 15000 }
      );

      const data = response.data;

      // Adjust based on the real provider's response shape.
      if (data && (data.status === 'ok' || data.success === true)) {
        return {
          success: true,
          providerOrderId: data.order_id || data.id,
          raw: data
        };
      }

      return { success: false, providerOrderId: null, raw: data };
    } catch (err) {
      return {
        success: false,
        providerOrderId: null,
        raw: { error: err.message, response: err.response?.data }
      };
    }
  }

  async checkStatus(providerOrderId) {
    try {
      const response = await axios.get(
        `${this.config.base_url}/order/${providerOrderId}`,
        {
          params: { api_key: this.config.api_key },
          timeout: 15000
        }
      );

      const data = response.data;
      // Map the provider's status strings to our internal statuses.
      const statusMap = {
        completed: 'completed',
        success: 'completed',
        done: 'completed',
        failed: 'failed',
        error: 'failed',
        cancelled: 'failed',
        processing: 'processing',
        pending: 'processing'
      };

      const mapped = statusMap[(data.status || '').toLowerCase()] || 'processing';
      return { status: mapped, raw: data };
    } catch (err) {
      // Network errors shouldn't be treated as permanent failures -
      // leave as processing so the poller retries.
      return { status: 'processing', raw: { error: err.message } };
    }
  }
}

module.exports = GenericAggregator;
