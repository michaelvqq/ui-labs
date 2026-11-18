import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { Binding, useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { setInterval } from "@rbxts/set-timeout";
import { Workspace } from "@rbxts/services";
import { AddComment, FindElementByPath, GetElementPath } from "Agent/AgentComments";
import { GetControlHandle } from "Agent/AgentRegistry";
import {
	AgentTweak,
	EncodeOrString,
	GetTargetInstance,
	GetTweaks,
	IsShowingOriginal,
	ReadProperty,
	RecordTweak,
	SetShowOriginal,
	TWEAKABLE,
	TweaksChanged,
	WriteProperty
} from "Agent/AgentTweaks";
import { FormatEncoded, FormatValue, ParseValue, ValuesEqual } from "Agent/AgentValues";
import { useToolbarHovered } from "Context/StoryPanelContext";
import { useInputBegan, useMousePos } from "Hooks/Context/UserInput";
import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import { useTheme } from "Hooks/Reflex/Use/Theme";
import Configs from "Plugin/Configs";
import Corner from "UI/Styles/Corner";
import { Div } from "UI/Styles/Div";

import { ElementText, FlattenControls } from "./CommentElements";
import ComponentHighlight from "./SelectElements/Highlight";
import { GetGuisAtPosition } from "./SelectElements/Utils";
import { useStoryLockAction } from "./Utils";

interface TweakElementsProps {
	Inside: boolean;
	Anchor: Binding<Vector2>;
	PreviewEntry: PreviewEntry;
	Viewport?: { GetMouse: () => Vector2; Clicked: RBXScriptSignal<() => void> };
}

interface Picked {
	Path: string;
	Position: Vector2;
}

const ACCENT = Color3.fromRGB(120, 220, 160);
const PANEL_WIDTH = 300;
const ROW_HEIGHT = 24;
const FONT = Font.fromName("GothamSSm", Enum.FontWeight.Medium);

interface TweakRowProps {
	Element: Instance;
	Target: string;
	Property: string;
	Label: string;
	Tweak?: AgentTweak;
	Order: number;
	OnCommit: (target: string, property: string, oldValue: unknown, newValue: unknown) => void;
	OnHover: (hovered: boolean) => void;
}

function TweakRow(props: TweakRowProps) {
	const theme = useTheme();
	const boxRef = useRef<TextBox>();
	const [invalid, setInvalid] = useState(false);

	const read = () => {
		const instance = GetTargetInstance(props.Element, props.Target);
		if (!instance) return $tuple(false, undefined as unknown);
		return ReadProperty(instance, props.Property);
	};

	useEffect(() => {
		const refresh = () => {
			const box = boxRef.current;
			if (!box || box.IsFocused()) return;
			const [ok, value] = read();
			if (ok) box.Text = FormatValue(value);
		};
		refresh();
		return setInterval(refresh, 0.3);
	}, [props.Element, props.Target, props.Property]);

	const commit = (box: TextBox) => {
		const instance = GetTargetInstance(props.Element, props.Target);
		if (!instance) return;
		const [ok, current] = ReadProperty(instance, props.Property);
		if (!ok) return;
		const parsed = ParseValue(box.Text, current);
		if (parsed === undefined) {
			setInvalid(true);
			box.Text = FormatValue(current);
			return;
		}
		setInvalid(false);
		if (ValuesEqual(current, parsed)) return;
		if (WriteProperty(instance, props.Property, parsed)) props.OnCommit(props.Target, props.Property, current, parsed);
	};

	const tweaked = props.Tweak !== undefined;
	return (
		<frame key={props.Label} LayoutOrder={props.Order} Size={new UDim2(1, 0, 0, ROW_HEIGHT)} BackgroundTransparency={1}>
			<textlabel
				Size={new UDim2(0.45, -4, 1, 0)}
				BackgroundTransparency={1}
				Text={props.Label}
				TextColor3={tweaked ? ACCENT : theme.Text.Disabled}
				FontFace={FONT}
				TextSize={12}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
			/>
			<textbox
				ref={boxRef}
				Position={UDim2.fromScale(0.45, 0)}
				Size={new UDim2(0.55, 0, 1, -2)}
				BackgroundColor3={theme.Search.Color}
				TextColor3={invalid ? Color3.fromRGB(255, 143, 143) : theme.Text.Color}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Regular)}
				TextSize={12}
				ClearTextOnFocus={false}
				TextXAlignment={Enum.TextXAlignment.Left}
				TextTruncate={Enum.TextTruncate.AtEnd}
				Text={""}
				Event={{
					FocusLost: (box) => commit(box),
					MouseEnter: () => props.OnHover(true),
					MouseLeave: () => props.OnHover(false)
				}}
			>
				<Corner Radius={4} />
				<uipadding PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
				{tweaked ? <uistroke Color={ACCENT} Thickness={1} ApplyStrokeMode={Enum.ApplyStrokeMode.Border} /> : undefined}
			</textbox>
		</frame>
	);
}

// Tweak tool: click an element, edit its properties live; every change is recorded for an AI agent (ui.tweaks())
function TweakElements(props: TweakElementsProps) {
	const theme = useTheme();
	const mousePos = useMousePos();
	const widgetInputBegan = useInputBegan();
	const [widgetToolbarHovered] = useToolbarHovered();
	const viewport = props.Viewport;
	const toolbarHovered = viewport ? false : widgetToolbarHovered;
	const getMouse = () => (viewport ? viewport.GetMouse() : mousePos.getValue());
	const entry = props.PreviewEntry;
	const holder = entry.Holder;
	const storyPath = entry.Module.GetFullName();

	const [hovered, setHovered] = useState<GuiObject>();
	const [picked, setPicked] = useState<Picked>();
	const [overUI, setOverUI] = useState(false);
	const [tweaks, setTweaks] = useState(() => GetTweaks());
	const [original, setOriginal] = useState(IsShowingOriginal());
	const [note, setNote] = useState("");
	const [sent, setSent] = useState(false);
	const [, setTick] = useState(0);

	useEventListener(TweaksChanged, () => {
		setTweaks(GetTweaks());
		setOriginal(IsShowingOriginal());
	});

	// the picked element is looked up by path each time (re-renders can replace instances)
	const element = picked && holder ? FindElementByPath(holder, picked.Path) : undefined;
	useEffect(() => {
		if (!picked) return;
		return setInterval(() => setTick((t) => t + 1), 0.5);
	}, [picked]);

	useEffect(() => {
		if (!props.Inside || toolbarHovered || !holder) {
			setHovered(undefined);
			return;
		}
		return setInterval(() => setHovered(GetGuisAtPosition(holder, getMouse())[0]), 0.1);
	}, [props.Inside, toolbarHovered, holder]);

	const onClick = () => {
		if (!props.Inside || toolbarHovered || overUI) return;
		if (!holder || !hovered) return;
		setSent(false);
		setNote("");
		setPicked({ Path: GetElementPath(holder, hovered), Position: getMouse().sub(props.Anchor.getValue()) });
	};
	useEventListener(viewport ? undefined : widgetInputBegan, (input: InputObject) => {
		if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
		onClick();
	});
	useEventListener(viewport?.Clicked, () => onClick());
	useStoryLockAction("TweakElements", viewport ? false : props.Inside);

	const elementTweaks = useMemo(
		() =>
			picked
				? tweaks.filter((t) => !t.Resolved && t.Story === storyPath && t.Element === picked.Path)
				: ([] as AgentTweak[]),
		[tweaks, picked, storyPath]
	);

	const onCommit = (target: string, property: string, oldValue: unknown, newValue: unknown) => {
		if (!element || !picked) return;
		const camera = Workspace.CurrentCamera;
		const handle = GetControlHandle(entry.Key);
		RecordTweak({
			Story: storyPath,
			StoryName: RemoveExtension(entry.Module.Name, Configs.Extensions.Story),
			Element: picked.Path,
			ElementClass: element.ClassName,
			ElementText: element.IsA("GuiObject") ? ElementText(element) : undefined,
			Target: target,
			Property: property,
			Old: EncodeOrString(oldValue),
			New: EncodeOrString(newValue),
			Controls: handle ? FlattenControls(handle.Values) : undefined,
			Viewport: {
				Width: camera ? math.round(camera.ViewportSize.X) : 0,
				Height: camera ? math.round(camera.ViewportSize.Y) : 0
			},
			Mode: viewport ? "viewport" : "widget"
		});
	};

	const sendToAI = () => {
		if (!element || !picked) return;
		const lines = elementTweaks.map(
			(t) =>
				`${t.Target !== "" ? t.Target + "." : ""}${t.Property}: ${FormatEncoded(t.Old)} -> ${FormatEncoded(t.New)}`
		);
		const body = note.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		if (body === "" && lines.isEmpty()) return;
		const handle = GetControlHandle(entry.Key);
		AddComment({
			Story: storyPath,
			StoryName: RemoveExtension(entry.Module.Name, Configs.Extensions.Story),
			Element: picked.Path,
			ElementClass: element.ClassName,
			ElementText: element.IsA("GuiObject") ? ElementText(element) : undefined,
			Rect: { X: 0, Y: 0, Width: 0, Height: 0 },
			Text: [body !== "" ? body : "Apply these tweaks", ...lines.map((l) => "- " + l)].join("\n"),
			Controls: handle ? FlattenControls(handle.Values) : undefined
		});
		setNote("");
		setSent(true);
	};

	const rows = new Map<string, React.Element>();
	if (element) {
		let order = 0;
		for (const option of TWEAKABLE) {
			const instance = GetTargetInstance(element, option.Target);
			if (!instance) continue;
			const [readable] = ReadProperty(instance, option.Property);
			if (!readable) continue;
			const label = (option.Target !== "" ? option.Target.gsub("^UI", "")[0] + "." : "") + (option.Label ?? option.Property);
			order++;
			rows.set(
				`${option.Target}.${option.Property}`,
				<TweakRow
					Element={element}
					Target={option.Target}
					Property={option.Property}
					Label={label}
					Order={order}
					Tweak={elementTweaks.find((t) => t.Target === option.Target && t.Property === option.Property)}
					OnCommit={onCommit}
					OnHover={setOverUI}
				/>
			);
		}
	}

	const button = (name: string, label: string, order: number, onClick: () => void, width = 70, active = false) => (
		<textbutton
			key={name}
			LayoutOrder={order}
			Size={UDim2.fromOffset(width, 22)}
			BackgroundColor3={active ? ACCENT : theme.ActionsPanel.TabHover}
			Text={label}
			TextColor3={active ? Color3.fromRGB(30, 30, 30) : theme.Text.Color}
			FontFace={FONT}
			TextSize={12}
			Event={{ Activated: onClick }}
		>
			<Corner Radius={4} />
		</textbutton>
	);

	const listHeight = math.min(rows.size(), 12) * (ROW_HEIGHT + 2);
	const panelHeight = 30 + listHeight + 70;

	return (
		<Div key={"TweakElements"}>
			{hovered !== undefined && holder && (hovered !== element || !picked) && (
				<ComponentHighlight key={"HoveredElement"} UIComponent={hovered} Holder={holder} Inset={props.Anchor} />
			)}
			{element !== undefined && element.IsA("GuiObject") && holder && (
				<ComponentHighlight key={"PickedElement"} UIComponent={element} Holder={holder} Inset={props.Anchor} />
			)}
			{picked && (
				<frame
					key={"TweakPanel"}
					Position={UDim2.fromOffset(picked.Position.X + 10, picked.Position.Y + 10)}
					Size={UDim2.fromOffset(PANEL_WIDTH, panelHeight)}
					BackgroundColor3={theme.Dropdown.Color}
					Active={true}
					ZIndex={5}
					Event={{
						MouseEnter: () => setOverUI(true),
						MouseLeave: () => setOverUI(false)
					}}
				>
					<Corner Radius={6} />
					<uistroke Color={ACCENT} Thickness={1} />
					<uipadding
						PaddingLeft={new UDim(0, 8)}
						PaddingRight={new UDim(0, 8)}
						PaddingTop={new UDim(0, 6)}
						PaddingBottom={new UDim(0, 6)}
					/>
					<textlabel
						key={"Title"}
						Size={new UDim2(1, -60, 0, 20)}
						BackgroundTransparency={1}
						Text={element ? `${element.ClassName} | ${picked.Path === "" ? "(story root)" : picked.Path}` : "element gone (re-rendered?)"}
						TextColor3={theme.Text.Color}
						FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
						TextSize={12}
						TextXAlignment={Enum.TextXAlignment.Left}
						TextTruncate={Enum.TextTruncate.AtEnd}
					/>
					<frame key={"TitleButtons"} Position={new UDim2(1, -56, 0, 0)} Size={UDim2.fromOffset(56, 20)} BackgroundTransparency={1}>
						<uilistlayout
							FillDirection={Enum.FillDirection.Horizontal}
							HorizontalAlignment={Enum.HorizontalAlignment.Right}
							Padding={new UDim(0, 4)}
						/>
						{button("Close", "X", 2, () => {
							setPicked(undefined);
							setOverUI(false);
						}, 22)}
					</frame>
					<scrollingframe
						key={"Rows"}
						Position={UDim2.fromOffset(0, 26)}
						Size={new UDim2(1, 0, 0, listHeight)}
						BackgroundTransparency={1}
						BorderSizePixel={0}
						ScrollBarThickness={4}
						AutomaticCanvasSize={Enum.AutomaticSize.Y}
						CanvasSize={new UDim2()}
					>
						<uilistlayout Padding={new UDim(0, 2)} SortOrder={Enum.SortOrder.LayoutOrder} />
						{rows}
					</scrollingframe>
					<frame key={"Footer"} Position={new UDim2(0, 0, 1, -62)} Size={new UDim2(1, 0, 0, 62)} BackgroundTransparency={1}>
						<textbox
							key={"Note"}
							Size={new UDim2(1, 0, 0, 24)}
							BackgroundColor3={theme.Search.Color}
							Text={note}
							PlaceholderText={sent ? "Sent to AI as a comment" : "Note for AI (optional)"}
							PlaceholderColor3={theme.Search.Placeholder}
							TextColor3={theme.Text.Color}
							FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Regular)}
							TextSize={12}
							ClearTextOnFocus={false}
							TextXAlignment={Enum.TextXAlignment.Left}
							Change={{ Text: (box) => setNote(box.Text) }}
						>
							<Corner Radius={4} />
							<uipadding PaddingLeft={new UDim(0, 6)} />
						</textbox>
						<frame key={"Buttons"} Position={UDim2.fromOffset(0, 30)} Size={new UDim2(1, 0, 0, 22)} BackgroundTransparency={1}>
							<uilistlayout
								FillDirection={Enum.FillDirection.Horizontal}
								HorizontalAlignment={Enum.HorizontalAlignment.Right}
								Padding={new UDim(0, 6)}
								SortOrder={Enum.SortOrder.LayoutOrder}
							/>
							<textlabel
								LayoutOrder={0}
								Size={new UDim2(1, -190, 1, 0)}
								BackgroundTransparency={1}
								Text={`${elementTweaks.size()} tweak${elementTweaks.size() === 1 ? "" : "s"} recorded`}
								TextColor3={theme.Text.Disabled}
								FontFace={FONT}
								TextSize={11}
								TextXAlignment={Enum.TextXAlignment.Left}
							/>
							{button("Original", original ? "Original" : "Tweaked", 1, () => SetShowOriginal(!original), 70, original)}
							{button("Send", "Send to AI", 2, sendToAI, 104, true)}
						</frame>
					</frame>
				</frame>
			)}
		</Div>
	);
}

export default TweakElements;
