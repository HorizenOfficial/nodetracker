const dns = require('dns');

export default function applyWorkaround() {
  const { lookup } = dns;
  dns.lookup = (name, opts, cb) => {
    if (typeof cb !== 'function') return lookup(name, { verbatim: true }, opts);
    return lookup(name, Object.assign({ verbatim: true }, opts), cb);
  };
}
