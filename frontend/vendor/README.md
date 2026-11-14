# Frozen React UMD runtime

The current live Pages HTML uses locally-hosted React UMD scripts. These are exact production snapshots, not dependencies guessed from npm.

- `react.production.min.js`: source preserved as plain JavaScript, original `/assets/react.js`, 10,751 characters, runtime version `18.3.1`.
- `react-dom.production.min.js.gz`: **gzip of the exact** original `/assets/react-dom.js`, uncompressed 131,835 characters, embedded version `18.3.1-next-f1338f8080-20240426`. gzip SHA-256 `138b6abbb6f1277db2eb918712b72057e9dff9106aebb79129d2912e33638f95`.

The build system decompresses ReactDOM into the original path. This is an archival dependency, not editable application code. Preserve its bundled MIT license comments; investigate the version mismatch before any dependency upgrade. Tests assert runtime version strings and original lengths.
