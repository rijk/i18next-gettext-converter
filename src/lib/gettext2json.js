const Gettext = require('node-gettext');
const Promise = require('bluebird');
const assign = require('object-assign'); // Support node <= 0.12

const plurals = require('./plurals');

function gettextToI18next(domain, body, options = {}) {
  return addTextDomain(domain, body, options)
  .then(data => {
    if (options.keyasareference) {
      setKeysAsReference(data);
    }

    return parseJSON(domain, data, options);
  })
  .then(json => JSON.stringify(json, null, 4));
}

/*
 * gettext --> barebone json
 */
function addTextDomain(domain, body, options = {}) {
  const gt = new Gettext();

  if (body.length > 0) {
    gt.addTextdomain(domain, body);
  }

  if (options.filter) {
    const filterAsync = Promise.promisify(options.filter);
    return filterAsync(gt, domain);
  }

  const normalizedDomain = gt._normalizeDomain(domain);
  return Promise.resolve(gt.domains[normalizedDomain] && gt.domains[normalizedDomain].translations);
}

function setKeysAsReference(data) {
  const keys = [];

  Object.keys(data).forEach(ctxt => {
    Object.keys(data[ctxt]).forEach(key => {
      if (data[ctxt][key].comments && data[ctxt][key].comments.reference) {
        data[ctxt][key].comments.reference.split(/\r?\n|\r/).forEach(id => {
          const x = data[ctxt][key];
          data[ctxt][id] = x;
          if (x.msgstr[0] === '') {
            x.msgstr[0] = x.msgid;
          }
          for (let i = 1; i < x.msgstr.length; i++) {
            if (x.msgstr[i] === '') {
              x.msgstr[i] = x.msgid_plural;
            }
          }
          x.msgid = id;
          if (id !== key) {
            keys.push([ctxt, key]);
          }
        });
      }
    });
  });

  keys.forEach(a => {
    const c = a[0];
    const k = a[1];

    delete data[c][k];
  });
}

/*
 * barebone json --> i18next json
 */
function parseJSON(domain, data = {}, options = {}) {
  const separator = options.keyseparator || '##';
  const json = {};
  const ctxSeparator = options.ctxSeparator || '_';

  Object.keys(data).forEach(m => {
    const context = data[m];

    Object.keys(context).forEach(key => {
      let targetKey = key;
      let appendTo = json;

      if (key.length === 0) {
        // delete if msgid is empty.
        // this might be the header.
        delete context[key];
        return;
      }

      if (key.indexOf(separator) > -1) {
        const keys = key.split(separator);

        let x = 0;
        while (keys[x]) {
          if (x < keys.length - 1) {
            appendTo[keys[x]] = appendTo[keys[x]] || {};
            appendTo = appendTo[keys[x]];
          } else {
            targetKey = keys[x];
          }
          x++;
        }
      }

      if (m !== '') targetKey = `${targetKey}${ctxSeparator}${m}`;

      const values = context[key].msgstr;
      const newValues = getGettextValues(values, domain, targetKey, options);
      assign(appendTo, newValues);
    });
  });

  return Promise.resolve(json);
}

function getGettextValues(values, domain, targetKey, options) {
  if (values.length === 1) {
    return emptyOrObject(targetKey, values[0], options);
  }

  const ext = plurals.rules[domain.replace('_', '-').split('-')[0]];
  const gettextValues = {};

  for (let i = 0; i < values.length; i++) {
    const pluralSuffix = getI18nextPluralExtension(ext, i);
    const pkey = targetKey + pluralSuffix;

    assign(gettextValues, emptyOrObject(pkey, values[i], options));
  }

  return gettextValues;
}

/*
 * helper to get plural suffix
 */
function getI18nextPluralExtension(ext, i) {
  if (ext && ext.nplurals === 2) {
    return i === 0 ? '' : '_plural';
  }
  return `_${i}`;
}

function toArrayIfNeeded(value, { splitNewLine }) {
  return (value.indexOf('\n') > -1 && splitNewLine)
    ? value.split('\n')
    : value;
}

function emptyOrObject(key, value, options) {
  if (options.skipUntranslated && !value) { // empty string or other falsey
    return {};
  }

  return { [key]: toArrayIfNeeded(value, options) };
}

module.exports = gettextToI18next;
