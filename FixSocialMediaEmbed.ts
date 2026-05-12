/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addMessagePreSendListener, type MessageSendListener, removeMessagePreSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

const X_REPLACEMENT_CUSTOM = "custom";

const DEFAULT_X_REPLACEMENT_DOMAIN = "fixupx.com";
const DEFAULT_TIKTOK_REPLACEMENT_DOMAIN = "kktiktok.com";
const DEFAULT_INSTAGRAM_REPLACEMENT_DOMAIN = "kkinstagram.com";

const SOCIAL_URL_RE = /(?:https?:\/\/)?(?:www\.|m\.|mobile\.)?(?:x\.com|twitter\.com|tiktok\.com|instagram\.com)\b[^\s<]*/gi;
const TRAILING_PUNCTUATION_RE = /[),.!?;:]+$/;

const settings = definePluginSettings({
    xReplacementDomain: {
        type: OptionType.SELECT,
        description: "Embed domain for X/Twitter status links",
        options: [
            { label: "FixupX", value: "fixupx.com", default: true },
            { label: "VXTwitter", value: "vxtwitter.com" },
            { label: "FXTwitter", value: "fxtwitter.com" },
            { label: "Custom", value: X_REPLACEMENT_CUSTOM }
        ]
    },
    customXReplacementDomain: {
        type: OptionType.STRING,
        description: "Custom embed domain for X/Twitter status links",
        default: DEFAULT_X_REPLACEMENT_DOMAIN,
        hidden: () => settings.store.xReplacementDomain !== X_REPLACEMENT_CUSTOM
    },
    tiktokReplacementDomain: {
        type: OptionType.SELECT,
        description: "Embed domain for TikTok links",
        options: [
            { label: "tnktok", value: "tnktok.com", default: true },
            { label: "TikTokEZ", value: "tiktokez.com" },
            { label: "kkTikTok", value: "kktiktok.com" },
            { label: "Custom", value: X_REPLACEMENT_CUSTOM }
        ]
    },
    customTiktokReplacementDomain: {
        type: OptionType.STRING,
        description: "Custom embed domain for TikTok links",
        default: DEFAULT_TIKTOK_REPLACEMENT_DOMAIN,
        hidden: () => settings.store.tiktokReplacementDomain !== X_REPLACEMENT_CUSTOM
    },
    instagramReplacementDomain: {
        type: OptionType.SELECT,
        description: "Embed domain for Instagram links",
        options: [
            { label: "kkInstagram", value: "kkinstagram.com", default: true },
            { label: "Custom", value: X_REPLACEMENT_CUSTOM }
        ]
    },
    customInstagramReplacementDomain: {
        type: OptionType.STRING,
        description: "Custom embed domain for Instagram links",
        default: DEFAULT_INSTAGRAM_REPLACEMENT_DOMAIN,
        hidden: () => settings.store.instagramReplacementDomain !== X_REPLACEMENT_CUSTOM
    },
    includeOriginalLink: {
        type: OptionType.BOOLEAN,
        description: "Add a suppressed original link below rewritten links",
        default: true
    }
});

function getCanonicalHost(hostname: string) {
    return hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, "");
}

function getXReplacementDomain() {
    return getConfiguredReplacementDomain(
        settings.store.xReplacementDomain,
        settings.store.customXReplacementDomain,
        DEFAULT_X_REPLACEMENT_DOMAIN
    );
}

function getTiktokReplacementDomain() {
    return getConfiguredReplacementDomain(
        settings.store.tiktokReplacementDomain,
        settings.store.customTiktokReplacementDomain,
        DEFAULT_TIKTOK_REPLACEMENT_DOMAIN
    );
}

function getInstagramReplacementDomain() {
    return getConfiguredReplacementDomain(
        settings.store.instagramReplacementDomain,
        settings.store.customInstagramReplacementDomain,
        DEFAULT_INSTAGRAM_REPLACEMENT_DOMAIN
    );
}

function getConfiguredReplacementDomain(selectedDomain: string, customDomain: string, fallbackDomain: string) {
    const domain = selectedDomain === X_REPLACEMENT_CUSTOM ? customDomain : selectedDomain;

    try {
        const url = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
        return getCanonicalHost(url.hostname) || fallbackDomain;
    } catch {
        return fallbackDomain;
    }
}

function getReplacementDomain(host: string) {
    if (host === "x.com" || host === "twitter.com") return getXReplacementDomain();
    if (host === "tiktok.com") return getTiktokReplacementDomain();
    if (host === "instagram.com") return getInstagramReplacementDomain();
}

function getTweetId(url: URL) {
    const host = getCanonicalHost(url.hostname);
    if (host !== "x.com" && host !== "twitter.com") return null;

    const parts = url.pathname.split("/").filter(Boolean);

    if (parts.length >= 3 && parts[1] === "status" && /^\d+$/.test(parts[2])) return parts[2];
    if (parts.length >= 4 && parts[0] === "i" && parts[1] === "web" && parts[2] === "status" && /^\d+$/.test(parts[3])) return parts[3];

    return null;
}

function shouldRewriteUrl(url: URL) {
    const host = getCanonicalHost(url.hostname);
    if (host === "x.com" || host === "twitter.com") {
        return Boolean(getTweetId(url));
    }

    return host === "tiktok.com" || host === "instagram.com";
}

function replaceSocialLinks(content: string) {
    return content.replace(SOCIAL_URL_RE, match => {
        const original = match;
        const trailingPunctuation = original.match(TRAILING_PUNCTUATION_RE)?.[0] ?? "";
        const link = trailingPunctuation ? original.slice(0, -trailingPunctuation.length) : original;
        const hasProtocol = /^https?:\/\//i.test(link);

        try {
            const url = new URL(hasProtocol ? link : `https://${link}`);
            const host = getCanonicalHost(url.hostname);
            const mapped = getReplacementDomain(host);

            if (!mapped || !shouldRewriteUrl(url)) return original;

            const originalUrl = url.toString();
            url.hostname = mapped;
            const rewritten = hasProtocol ? url.toString() : url.toString().replace(/^https:\/\//, "");

            if (!settings.store.includeOriginalLink) return `${rewritten}${trailingPunctuation}`;

            return `${rewritten}\n[original link](<${originalUrl}>) 🖇️${trailingPunctuation}`;
        } catch {
            return original;
        }
    });
}

let listener: MessageSendListener | null = null;

export default definePlugin({
    name: "FixSocialMediaEmbeds",
    description: "replace x/tiktok/instagram links with embed-friendly domains",
    authors: [{ name: "xo-xo-xo-xo", id: 770203704585486361n }],
    settings,

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
