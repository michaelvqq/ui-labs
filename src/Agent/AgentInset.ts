import { Signal } from "@rbxts/lemon-signal";
import { GuiService } from "@rbxts/services";

// Simulated Roblox GUI inset for a preview: the top bar band and, on phones, the device safe areas.
// Drawn by the GUI inset overlay and handed to stories through the environment injection (GetGuiInset), since
// GuiService:GetGuiInset() can't be overridden from a plugin.

export type InsetDevice = "phone" | "phonePortrait" | "desktop";

export interface SimulatedInset {
	Device: InsetDevice;
	Size: Vector2; // preview size the inset was computed for
	TopbarHeight: number; // Roblox top bar band
	SafeArea: { Left: number; Right: number; Top: number; Bottom: number }; // device notch / home indicator
	/** What GuiService:GetGuiInset() would return on that device: top-left and bottom-right. */
	GuiInsetTopLeft: Vector2;
	GuiInsetBottomRight: Vector2;
}

export const InsetChanged = new Signal<[string]>(); // preview UID

const PHONE_TOPBAR = 58;

function DesktopTopbar() {
	const [ok, inset] = pcall(() => GuiService.TopbarInset);
	if (ok && inset.Height > 0) return inset.Height;
	return PHONE_TOPBAR; // Studio's edit viewport has no top bar; current Roblox clients use 58
}

export function DeviceFor(size: Vector2): InsetDevice {
	if (size.Y > size.X && size.X <= 500) return "phonePortrait";
	if (size.Y <= 450 && size.X <= 1000) return "phone";
	return "desktop";
}

/** Preview size: the capture frame size, else the story holder's size at 100% zoom. */
export function PreviewSize(entry: PreviewEntry) {
	if (entry.Capture?.Size) return entry.Capture.Size;
	const listener = entry.ListenerFrame;
	if (!listener) return new Vector2(1280, 832);
	const zoom = entry.OnViewport ? 1 : entry.Zoom / 100;
	return listener.AbsoluteSize.div(zoom);
}

export function GetSimulatedInset(entry: PreviewEntry): SimulatedInset | undefined {
	if (!entry.ShowInset) return undefined;
	const size = PreviewSize(entry);
	const device = DeviceFor(size);
	const safe =
		device === "phone"
			? { Left: 44, Right: 44, Top: 0, Bottom: 21 }
			: device === "phonePortrait"
				? { Left: 0, Right: 0, Top: 47, Bottom: 34 }
				: { Left: 0, Right: 0, Top: 0, Bottom: 0 };
	const topbar = device === "desktop" ? DesktopTopbar() : PHONE_TOPBAR;
	return {
		Device: device,
		Size: size,
		TopbarHeight: topbar,
		SafeArea: safe,
		GuiInsetTopLeft: new Vector2(safe.Left, topbar),
		GuiInsetBottomRight: new Vector2(safe.Right, safe.Bottom)
	};
}
