import { useEventListener, useUnmountEffect } from "@rbxts/pretty-react-hooks";
import React, { Binding, useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { setInterval } from "@rbxts/set-timeout";
import {
	AddComment,
	AgentComment,
	CommentsChanged,
	CurrentViewport,
	DeleteComments,
	FindElementByPath,
	GetComments,
	GetElementPath,
	UpdateComment
} from "Agent/AgentComments";
import { GetControlHandle } from "Agent/AgentRegistry";
import { useToolbarHovered } from "Context/StoryPanelContext";
import { useInputBegan, useMousePos } from "Hooks/Context/UserInput";
import { useTheme } from "Hooks/Reflex/Use/Theme";
import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import Configs from "Plugin/Configs";
import Corner from "UI/Styles/Corner";
import { Div } from "UI/Styles/Div";

import ComponentHighlight from "./SelectElements/Highlight";
import { GetGuisAtPosition } from "./SelectElements/Utils";
import { useStoryLockAction } from "./Utils";

interface CommentElementsProps {
	Inside: boolean;
	Anchor: Binding<Vector2>;
	PreviewEntry: PreviewEntry;
	// Viewport mode: mouse position and clicks come from the plugin mouse instead of the widget
	Viewport?: { GetMouse: () => Vector2; Clicked: RBXScriptSignal<() => void> };
}

interface Draft {
	Element?: GuiObject;
	Path: string;
	Position: Vector2; // relative to the tools anchor
	Editing?: AgentComment;
}

interface Pin {
	Comment: AgentComment;
	Index: number;
	Position?: Vector2;
}

const PIN_SIZE = 18;
const BOX_SIZE = new Vector2(260, 108);
const ACCENT = Color3.fromRGB(255, 196, 61);

export function FlattenControls(values: Record<string, unknown>, prefix = "", out: Record<string, string> = {}) {
	for (const [name, value] of pairs(values)) {
		if (typeIs(value, "table") && getmetatable(value) === undefined && !("Color" in (value as object))) {
			FlattenControls(value as Record<string, unknown>, `${prefix}${name}.`, out);
		} else {
			out[`${prefix}${name}`] = tostring(value);
		}
	}
	return out;
}

export function ElementText(gui: GuiObject) {
	if (gui.IsA("TextLabel") || gui.IsA("TextButton") || gui.IsA("TextBox")) {
		const text = gui.ContentText !== "" ? gui.ContentText : gui.Text;
		return text.sub(1, 120);
	}
	// first text below it, so "Frame[3]" still says which card it is
	for (const descendant of gui.GetDescendants()) {
		if (descendant.IsA("TextLabel") && descendant.Visible && descendant.ContentText !== "") {
			return descendant.ContentText.sub(1, 120);
		}
	}
	return undefined;
}

function CommentElements(props: CommentElementsProps) {
	const theme = useTheme();
	const mousePos = useMousePos();
	const widgetInputBegan = useInputBegan();
	const [widgetToolbarHovered] = useToolbarHovered();
	const viewport = props.Viewport;
	const toolbarHovered = viewport ? false : widgetToolbarHovered;
	const getMouse = () => (viewport ? viewport.GetMouse() : mousePos.getValue());
	const zoom = viewport ? 1 : props.PreviewEntry.Zoom / 100;
	const entry = props.PreviewEntry;
	const holder = entry.Holder;
	const storyPath = entry.Module.GetFullName();

	const [hovered, setHovered] = useState<GuiObject>();
	const [draft, setDraft] = useState<Draft>();
	const [overUI, setOverUI] = useState(false);
	const [comments, setComments] = useState(() => GetComments());
	const [pins, setPins] = useState<Pin[]>([]);
	const [text, setText] = useState("");
	const textBoxRef = useRef<TextBox>();

	useEventListener(CommentsChanged, () => setComments(GetComments()));

	const storyComments = useMemo(
		() => comments.filter((comment) => comment.Story === storyPath && !comment.Resolved),
		[comments, storyPath]
	);

	// hovered element (same picking as Select Elements)
	useEffect(() => {
		if (!props.Inside || toolbarHovered || !holder) {
			setHovered(undefined);
			return;
		}
		return setInterval(() => {
			const inside = GetGuisAtPosition(holder, getMouse());
			setHovered(inside[0]);
		}, 0.1);
	}, [props.Inside, toolbarHovered, holder]);

	// pins follow their elements
	useEffect(() => {
		const update = () => {
			const anchor = props.Anchor.getValue();
			setPins(
				storyComments.map((comment, index) => {
					const element = holder ? FindElementByPath(holder, comment.Element) : undefined;
					const position =
						element && element.IsA("GuiObject") ? element.AbsolutePosition.sub(anchor) : undefined;
					return { Comment: comment, Index: index + 1, Position: position };
				})
			);
		};
		update();
		return setInterval(update, 0.2);
	}, [storyComments, holder]);

	const onClick = () => {
		if (!props.Inside || toolbarHovered || overUI) return;
		if (!holder || !hovered) return;
		const position = getMouse().sub(props.Anchor.getValue());
		setText("");
		setDraft({ Element: hovered, Path: GetElementPath(holder, hovered), Position: position });
	};
	useEventListener(viewport ? undefined : widgetInputBegan, (input: InputObject) => {
		if (input.UserInputType !== Enum.UserInputType.MouseButton1) return;
		onClick();
	});
	useEventListener(viewport?.Clicked, () => onClick());

	useEffect(() => {
		if (!draft) return;
		task.defer(() => textBoxRef.current?.CaptureFocus());
	}, [draft]);

	useUnmountEffect(() => setOverUI(false));
	useStoryLockAction("CommentElements", viewport ? false : props.Inside);

	const save = () => {
		if (!draft || !holder) return;
		const body = text.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
		if (body === "") return;
		if (draft.Editing) {
			UpdateComment(draft.Editing.Id, { Text: body });
		} else {
			const element = draft.Element!;
			const relative = element.AbsolutePosition.sub(holder.AbsolutePosition).div(zoom);
			const handle = GetControlHandle(entry.Key);
			AddComment({
				Story: storyPath,
				StoryName: RemoveExtension(entry.Module.Name, Configs.Extensions.Story),
				Element: draft.Path,
				ElementClass: element.ClassName,
				ElementText: ElementText(element),
				Rect: {
					X: math.round(relative.X),
					Y: math.round(relative.Y),
					Width: math.round(element.AbsoluteSize.X / zoom),
					Height: math.round(element.AbsoluteSize.Y / zoom)
				},
				Text: body,
				Controls: handle ? FlattenControls(handle.Values) : undefined,
				Scope: "element",
				Viewport: CurrentViewport()
			});
		}
		setDraft(undefined);
		setOverUI(false);
	};

	const cancel = () => {
		setDraft(undefined);
		setOverUI(false);
	};

	const remove = () => {
		if (draft?.Editing) DeleteComments((comment) => comment.Id === draft.Editing!.Id);
		cancel();
	};

	const button = (name: string, label: string, order: number, onClick: () => void, color?: Color3) => (
		<textbutton
			key={name}
			LayoutOrder={order}
			Size={UDim2.fromOffset(62, 22)}
			BackgroundColor3={color ?? theme.ActionsPanel.TabHover}
			Text={label}
			TextColor3={color ? Color3.fromRGB(30, 30, 30) : theme.Text.Color}
			FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Medium)}
			TextSize={12}
			AutoButtonColor={true}
			Event={{ Activated: onClick }}
		>
			<Corner Radius={4} />
		</textbutton>
	);

	const pinElements = new Map<string, React.Element>();
	for (const pin of pins) {
		if (!pin.Position) continue;
		pinElements.set(
			`Pin_${pin.Comment.Id}`,
			<textbutton
				Position={UDim2.fromOffset(pin.Position.X - PIN_SIZE / 2, pin.Position.Y - PIN_SIZE / 2)}
				Size={UDim2.fromOffset(PIN_SIZE, PIN_SIZE)}
				BackgroundColor3={ACCENT}
				Text={tostring(pin.Index)}
				TextColor3={Color3.fromRGB(30, 30, 30)}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
				TextSize={11}
				ZIndex={3}
				Event={{
					MouseEnter: () => setOverUI(true),
					MouseLeave: () => setOverUI(false),
					Activated: () => {
						setText(pin.Comment.Text);
						setDraft({ Path: pin.Comment.Element, Position: pin.Position!, Editing: pin.Comment });
					}
				}}
			>
				<Corner Radius={PIN_SIZE / 2} />
				<uistroke Color={Color3.fromRGB(30, 30, 30)} Thickness={1} />
			</textbutton>
		);
	}

	const draftElement = draft?.Element ?? (draft && holder ? FindElementByPath(holder, draft.Path) : undefined);

	return (
		<Div key={"CommentElements"}>
			{hovered !== undefined && draft === undefined && holder && (
				<ComponentHighlight key={"HoveredElement"} UIComponent={hovered} Holder={holder} Inset={props.Anchor} />
			)}
			{draftElement !== undefined && draftElement.IsA("GuiObject") && holder && (
				<ComponentHighlight key={"DraftElement"} UIComponent={draftElement} Holder={holder} Inset={props.Anchor} />
			)}
			{pinElements}
			{draft && (
				<frame
					key={"CommentBox"}
					Position={UDim2.fromOffset(draft.Position.X + 8, draft.Position.Y + 8)}
					Size={UDim2.fromOffset(BOX_SIZE.X, BOX_SIZE.Y)}
					BackgroundColor3={theme.Dropdown.Color}
					ZIndex={4}
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
						key={"Path"}
						Size={new UDim2(1, 0, 0, 14)}
						BackgroundTransparency={1}
						Text={`Comment for AI | ${draft.Path === "" ? "(story root)" : draft.Path}`}
						TextColor3={theme.Text.Disabled}
						FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Medium)}
						TextSize={11}
						TextXAlignment={Enum.TextXAlignment.Left}
						TextTruncate={Enum.TextTruncate.AtEnd}
					/>
					<textbox
						key={"Input"}
						ref={textBoxRef}
						Position={UDim2.fromOffset(0, 18)}
						Size={new UDim2(1, 0, 0, 46)}
						BackgroundColor3={theme.Search.Color}
						Text={text}
						PlaceholderText={"What should change? (Enter to save)"}
						PlaceholderColor3={theme.Search.Placeholder}
						TextColor3={theme.Text.Color}
						FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Regular)}
						TextSize={13}
						TextWrapped={true}
						ClearTextOnFocus={false}
						TextXAlignment={Enum.TextXAlignment.Left}
						TextYAlignment={Enum.TextYAlignment.Top}
						Change={{ Text: (box) => setText(box.Text) }}
						Event={{
							FocusLost: (box, enterPressed) => {
								if (enterPressed) save();
							}
						}}
					>
						<Corner Radius={4} />
						<uipadding PaddingLeft={new UDim(0, 6)} PaddingTop={new UDim(0, 4)} PaddingRight={new UDim(0, 6)} />
					</textbox>
					<frame key={"Buttons"} Position={UDim2.fromOffset(0, 70)} Size={new UDim2(1, 0, 0, 22)} BackgroundTransparency={1}>
						<uilistlayout
							FillDirection={Enum.FillDirection.Horizontal}
							HorizontalAlignment={Enum.HorizontalAlignment.Right}
							Padding={new UDim(0, 6)}
							SortOrder={Enum.SortOrder.LayoutOrder}
						/>
						{draft.Editing ? button("Delete", "Delete", 1, remove, Color3.fromRGB(255, 143, 143)) : undefined}
						{button("Cancel", "Cancel", 2, cancel)}
						{button("Save", "Save", 3, save, ACCENT)}
					</frame>
				</frame>
			)}
		</Div>
	);
}

export default CommentElements;
