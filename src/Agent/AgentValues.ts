// Converts property values to/from JSON-safe data (plugin settings can't hold Roblox datatypes) and to/from the text
// shown in the Tweak panel.

export type EncodedValue =
	| { t: "number"; v: number }
	| { t: "string"; v: string }
	| { t: "boolean"; v: boolean }
	| { t: "Color3"; v: [number, number, number] }
	| { t: "UDim"; v: [number, number] }
	| { t: "UDim2"; v: [number, number, number, number] }
	| { t: "Vector2"; v: [number, number] }
	| { t: "EnumItem"; e: string; v: string }
	| { t: "FontWeight"; v: string };

function Round(n: number, places = 3) {
	const m = 10 ** places;
	return math.round(n * m) / m;
}

export function EncodeValue(value: unknown): EncodedValue | undefined {
	if (typeIs(value, "number")) return { t: "number", v: value };
	if (typeIs(value, "string")) return { t: "string", v: value };
	if (typeIs(value, "boolean")) return { t: "boolean", v: value };
	if (typeIs(value, "Color3")) return { t: "Color3", v: [value.R, value.G, value.B] };
	if (typeIs(value, "UDim")) return { t: "UDim", v: [value.Scale, value.Offset] };
	if (typeIs(value, "UDim2")) return { t: "UDim2", v: [value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset] };
	if (typeIs(value, "Vector2")) return { t: "Vector2", v: [value.X, value.Y] };
	if (typeIs(value, "EnumItem")) return { t: "EnumItem", e: tostring(value.EnumType), v: value.Name };
	if (typeIs(value, "Font")) return { t: "FontWeight", v: value.Weight.Name };
	return undefined;
}

export function DecodeValue(encoded: EncodedValue, current?: unknown): unknown {
	switch (encoded.t) {
		case "number":
		case "string":
		case "boolean":
			return encoded.v;
		case "Color3":
			return new Color3(encoded.v[0], encoded.v[1], encoded.v[2]);
		case "UDim":
			return new UDim(encoded.v[0], encoded.v[1]);
		case "UDim2":
			return new UDim2(encoded.v[0], encoded.v[1], encoded.v[2], encoded.v[3]);
		case "Vector2":
			return new Vector2(encoded.v[0], encoded.v[1]);
		case "EnumItem": {
			const enumType = (Enum as unknown as Record<string, Record<string, EnumItem>>)[encoded.e];
			return enumType?.[encoded.v];
		}
		case "FontWeight": {
			const weight = (Enum.FontWeight as unknown as Record<string, Enum.FontWeight>)[encoded.v];
			if (typeIs(current, "Font") && weight) {
				return new Font(current.Family, weight, current.Style);
			}
			return undefined;
		}
	}
}

/** Text for the panel / for agents, e.g. "#ff8800", "{0.5, 10}, {0, 40}", "Bold". */
export function FormatValue(value: unknown): string {
	if (typeIs(value, "number")) return tostring(Round(value));
	if (typeIs(value, "string")) return value;
	if (typeIs(value, "boolean")) return tostring(value);
	if (typeIs(value, "Color3")) return "#" + value.ToHex().lower();
	if (typeIs(value, "UDim")) return `${Round(value.Scale)}, ${Round(value.Offset)}`;
	if (typeIs(value, "UDim2"))
		return `{${Round(value.X.Scale)}, ${Round(value.X.Offset)}}, {${Round(value.Y.Scale)}, ${Round(value.Y.Offset)}}`;
	if (typeIs(value, "Vector2")) return `${Round(value.X)}, ${Round(value.Y)}`;
	if (typeIs(value, "EnumItem")) return value.Name;
	if (typeIs(value, "Font")) return value.Weight.Name;
	return tostring(value);
}

export function FormatEncoded(encoded: EncodedValue | undefined) {
	if (!encoded) return "?";
	if (encoded.t === "FontWeight") return encoded.v;
	return FormatValue(DecodeValue(encoded));
}

function Numbers(text: string) {
	const out: number[] = [];
	for (const [n] of text.gmatch("-?%d*%.?%d+")) out.push(tonumber(n)!);
	return out;
}

/** Parses panel text into a value of the same type as `current`. Returns undefined when it can't. */
export function ParseValue(text: string, current: unknown): unknown {
	const trimmed = text.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
	if (typeIs(current, "number")) return tonumber(trimmed);
	if (typeIs(current, "string")) return text;
	if (typeIs(current, "boolean")) {
		const lower = trimmed.lower();
		if (lower === "true" || lower === "1" || lower === "yes") return true;
		if (lower === "false" || lower === "0" || lower === "no") return false;
		return undefined;
	}
	if (typeIs(current, "Color3")) {
		if (trimmed.sub(1, 1) === "#" || trimmed.match("^%x%x%x%x%x%x$")[0] !== undefined) {
			const [ok, color] = pcall(() => Color3.fromHex(trimmed));
			return ok ? color : undefined;
		}
		const n = Numbers(trimmed);
		if (n.size() !== 3) return undefined;
		const max = math.max(n[0], n[1], n[2]);
		return max > 1 ? Color3.fromRGB(n[0], n[1], n[2]) : new Color3(n[0], n[1], n[2]);
	}
	if (typeIs(current, "UDim")) {
		const n = Numbers(trimmed);
		if (n.size() === 1) return new UDim(0, n[0]);
		return n.size() === 2 ? new UDim(n[0], n[1]) : undefined;
	}
	if (typeIs(current, "UDim2")) {
		const n = Numbers(trimmed);
		if (n.size() === 2) return UDim2.fromOffset(n[0], n[1]);
		return n.size() === 4 ? new UDim2(n[0], n[1], n[2], n[3]) : undefined;
	}
	if (typeIs(current, "Vector2")) {
		const n = Numbers(trimmed);
		return n.size() === 2 ? new Vector2(n[0], n[1]) : undefined;
	}
	if (typeIs(current, "EnumItem")) {
		for (const item of current.EnumType.GetEnumItems()) {
			if (item.Name.lower() === trimmed.lower()) return item;
		}
		return undefined;
	}
	if (typeIs(current, "Font")) {
		for (const item of Enum.FontWeight.GetEnumItems()) {
			if (item.Name.lower() === trimmed.lower()) return new Font(current.Family, item, current.Style);
		}
		return undefined;
	}
	return undefined;
}

export function ValuesEqual(a: unknown, b: unknown) {
	if (typeIs(a, "Font") && typeIs(b, "Font")) return a.Weight === b.Weight && a.Family === b.Family;
	if (typeIs(a, "number") && typeIs(b, "number")) return math.abs(a - b) < 1e-4;
	if (typeIs(a, "Color3") && typeIs(b, "Color3")) return a.ToHex() === b.ToHex();
	return a === b;
}
