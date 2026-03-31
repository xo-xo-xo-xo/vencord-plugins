import { addMessagePreSendListener, removeMessagePreSendListener, MessageSendListener } from "@api/MessageEvents";
import definePlugin from "@utils/types";

const DOMAIN_MAP: Record<string, string> = {
    "x.com": "fixupx.com",
    "twitter.com": "fixupx.com",
    "tiktok.com": "tnktok.com",
    "instagram.com": "kkinstagram.com"
};

const PROTOCOL_URL_RE = /(https?:\/\/)(?:www\.|m\.|mobile\.)?(x\.com|twitter\.com|tiktok\.com|instagram\.com)\b/gi;
const BARE_DOMAIN_RE = /\b(?:www\.|m\.|mobile\.)?(x\.com|twitter\.com|tiktok\.com|instagram\.com)\b/gi;

function replaceSocialLinks(content: string) {
    let out = content.replace(PROTOCOL_URL_RE, (_match, proto: string, domain: string) => {
        const mapped = DOMAIN_MAP[domain.toLowerCase()];
        return mapped ? `${proto}${mapped}` : _match;
    });

    out = out.replace(BARE_DOMAIN_RE, (_match, domain: string) => {
        const mapped = DOMAIN_MAP[domain.toLowerCase()];
        return mapped ?? _match;
    });

    return out;
}

let listener: MessageSendListener | null = null;

export default definePlugin({
    name: "FixSocialMediaEmbeds",
    description: "replace x/tiktok/instagram links with embed-friendly domains.",
    authors: [{ name: "xo-xo-xo-xo", id: 0n }],

    start() {
        listener = (_, message) => {
            const next = replaceSocialLinks(message.content);
            if (next !== message.content) message.content = next;
        };
        addMessagePreSendListener(listener);
    },

    stop() {
        if (listener) removeMessagePreSendListener(listener);
        listener = null;
    }
});
