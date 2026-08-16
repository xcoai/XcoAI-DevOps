function decode_target_url(r) {
    return decodeURIComponent(r.args.target_url);
}
function encode_target_url(r) {
    return encodeURIComponent(r.args.target_url);
}

export default {decode_target_url, encode_target_url};