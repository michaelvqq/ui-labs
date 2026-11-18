import { Signal } from "@rbxts/lemon-signal";
import { Debris } from "@rbxts/services";

// Makes agent actions visible: an activity line in the AI Labs window and a short "AI" ring on targeted elements.

export interface ActivityEntry {
	Text: string;
	Time: number;
}

const history: ActivityEntry[] = [];
export const ActivityChanged = new Signal<[ActivityEntry]>();

export function PushActivity(text: string) {
	const entry = { Text: text, Time: os.clock() };
	history.push(entry);
	if (history.size() > 50) history.remove(0);
	ActivityChanged.Fire(entry);
}

export function GetActivity() {
	return history;
}

const ACCENT = Color3.fromRGB(255, 92, 168);
const flashes = new Set<Instance>();

/**
 * Draws a ring labelled `label` over `element` for `duration` seconds. The ring goes in the story's input listener
 * frame (a sibling of the story, same coordinates), so it shows in the window and on the viewport without touching
 * the story's own tree.
 */
export function FlashElement(element: GuiObject, listener: Frame | undefined, label = "AI", duration = 1.2) {
	if (!listener || !listener.Parent) return;
	const size = listener.AbsoluteSize;
	if (size.X <= 0 || size.Y <= 0) return;
	const offset = element.AbsolutePosition.sub(listener.AbsolutePosition);

	const ring = new Instance("Frame");
	ring.Name = "AILabsFlash";
	ring.Archivable = false;
	ring.BackgroundTransparency = 1;
	ring.Position = UDim2.fromScale(offset.X / size.X, offset.Y / size.Y);
	ring.Size = UDim2.fromScale(element.AbsoluteSize.X / size.X, element.AbsoluteSize.Y / size.Y);
	ring.ZIndex = 1000;

	const stroke = new Instance("UIStroke");
	stroke.Color = ACCENT;
	stroke.Thickness = 3;
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border;
	stroke.Parent = ring;
	const corner = new Instance("UICorner");
	corner.CornerRadius = new UDim(0, 4);
	corner.Parent = ring;

	const tag = new Instance("TextLabel");
	tag.Name = "Label";
	tag.AutomaticSize = Enum.AutomaticSize.X;
	tag.Size = UDim2.fromOffset(0, 18);
	tag.Position = UDim2.fromOffset(0, -20);
	tag.BackgroundColor3 = ACCENT;
	tag.TextColor3 = new Color3(1, 1, 1);
	tag.FontFace = Font.fromName("GothamSSm", Enum.FontWeight.Bold);
	tag.TextSize = 12;
	tag.Text = label;
	tag.ZIndex = 1001;
	const padding = new Instance("UIPadding");
	padding.PaddingLeft = new UDim(0, 6);
	padding.PaddingRight = new UDim(0, 6);
	padding.Parent = tag;
	const tagCorner = new Instance("UICorner");
	tagCorner.CornerRadius = new UDim(0, 4);
	tagCorner.Parent = tag;
	tag.Parent = ring;

	ring.Parent = listener;
	flashes.add(ring);
	ring.Destroying.Connect(() => flashes.delete(ring));
	Debris.AddItem(ring, duration);
}

/** Removes any rings still showing (before a screenshot, so they aren't in it). */
export function ClearFlashes() {
	for (const ring of flashes) ring.Destroy();
	flashes.clear();
}
