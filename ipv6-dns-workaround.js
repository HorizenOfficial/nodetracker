'use strict';

const dns = require('dns'), {lookup} = dns;
dns.lookup = function(name, opts, cb) {
  if (typeof cb !== 'function') return lookup(name, {verbatim:true}, opts);
  return lookup(name, Object.assign({verbatim:true}, opts), cb);
};
