const dns = require('dns');

const { lookup } = dns;
dns.lookup = (name, opts, cb) => {
  if (typeof cb !== 'function') return lookup(name, { verbatim: true, family: 6 }, opts);
  return lookup(name, Object.assign(opts, { verbatim: true, family: 6 }), cb);
};
