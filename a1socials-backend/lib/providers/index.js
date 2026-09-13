const GenericAggregator = require('./genericAggregator');

// As you onboard real providers with different API shapes, add a case here
// and create a matching file (e.g. seagm.js, yokcash.js) extending BaseProvider.
function getProviderAdapter(providerRow) {
  switch (providerRow.name.toLowerCase()) {
    // case 'seagm':
    //   return new SeagmProvider(providerRow);
    default:
      return new GenericAggregator(providerRow);
  }
}

module.exports = { getProviderAdapter };
