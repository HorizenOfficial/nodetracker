const dns = require('dns');

const { lookup } = dns;
dns.lookup = (name, opts, cb) => {
  if (typeof cb !== 'function') return lookup(name, { verbatim: true }, opts);
  return lookup(name, Object.assign({ verbatim: true }, opts), cb);
};
