import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { CommentsChanged, DeleteComments, GetComments, UpdateComment } from "Agent/AgentComments";
import { OpenItem } from "Agent/AgentNavigate";
import { AddPageComment } from "Agent/AgentPageComment";
import { DeleteTweaks, GetTweaks, TweaksChanged, UpdateTweak } from "Agent/AgentTweaks";
import { FormatEncoded } from "Agent/AgentValues";
import { useTheme } from "Hooks/Reflex/Use/Theme";
import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import Configs from "Plugin/Configs";
import { selectCommentsPanel, selectPageComposer } from "Reflex/Interface";
import Corner from "UI/Styles/Corner";

export type ItemStatus = "Open" | "Seen" | "In progress" | "Done";

export interface PanelItem {
	Kind: "comment" | "tweak";
	Id: string;
	Story: string;
	StoryName: string;
	Element: string;
	Text: string;
	Created: number;
	Status: ItemStatus;
	Note?: string;
	SeenBy?: string;
	Page?: boolean;
}

const STATUS_COLORS: Record<ItemStatus, Color3> = {
	Open: Color3.fromRGB(255, 196, 61),
	Seen: Color3.fromRGB(196, 150, 255),
	"In progress": Color3.fromRGB(105, 181, 255),
	Done: Color3.fromRGB(120, 220, 160)
};
const FILTERS = ["All", "Open", "Done", "This story"] as const;
type Filter = (typeof FILTERS)[number];
const FONT = Font.fromName("GothamSSm", Enum.FontWeight.Medium);

function StatusOf(item: { Resolved: boolean; Claimed?: boolean; Seen?: boolean }): ItemStatus {
	if (item.Resolved) return "Done";
	if (item.Claimed) return "In progress";
	if (item.Seen) return "Seen";
	return "Open";
}

export function GetPanelItems(): PanelItem[] {
	const items: PanelItem[] = [];
	for (const c of GetComments()) {
		items.push({
			Kind: "comment",
			Id: c.Id,
			Story: c.Story,
			StoryName: c.StoryName,
			Element: c.Element,
			Text: c.Text,
			Created: c.Created,
			Status: StatusOf(c),
			Note: c.Note,
			SeenBy: c.SeenBy,
			Page: c.Scope === "story"
		});
	}
	for (const t of GetTweaks()) {
		items.push({
			Kind: "tweak",
			Id: t.Id,
			Story: t.Story,
			StoryName: t.StoryName,
			Element: t.Element,
			Text: `${t.Target !== "" ? t.Target + "." : ""}${t.Property} ${FormatEncoded(t.Old)} -> ${FormatEncoded(t.New)}`,
			Created: t.Updated ?? t.Created,
			Status: StatusOf(t),
			Note: t.Note,
			SeenBy: t.SeenBy
		});
	}
	return items;
}

export function CountOpenItems() {
	return GetPanelItems().filter((item) => item.Status !== "Done").size();
}

function Ago(time: number) {
	const seconds = math.max(0, os.time() - time);
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${math.floor(seconds / 3600)}h ago`;
	return `${math.floor(seconds / 86400)}d ago`;
}

function ShortPath(path: string) {
	if (path === "") return "(story root)";
	const parts = path.split("/");
	return parts.size() <= 2 ? path : ".../" + parts[parts.size() - 2] + "/" + parts[parts.size() - 1];
}

function CommentsPanel() {
	const theme = useTheme();
	const open = useSelector(selectCommentsPanel);
	const { setCommentsPanel, setPageComposer } = useProducer<RootProducer>();
	const rootEntry = useSelector((state: RootState) => state.storyPreview.mountPreviews.get(Configs.RootPreviewKey));
	const currentStory = rootEntry?.Module;
	const composing = useSelector(selectPageComposer);
	const setComposing = (open: boolean) => setPageComposer(open);
	const inputRef = useRef<TextBox>();
	useEffect(() => {
		if (composing && open) task.defer(() => inputRef.current?.CaptureFocus());
	}, [composing, open]);
	const [draft, setDraft] = useState("");
	const [items, setItems] = useState(GetPanelItems);
	const [filter, setFilter] = useState<Filter>("All");

	useEventListener(CommentsChanged, () => setItems(GetPanelItems()));
	useEventListener(TweaksChanged, () => setItems(GetPanelItems()));

	const groups = useMemo(() => {
		const currentPath = currentStory?.GetFullName();
		const filtered = items.filter((item) => {
			if (filter === "Open") return item.Status !== "Done";
			if (filter === "Done") return item.Status === "Done";
			if (filter === "This story") return item.Story === currentPath;
			return true;
		});
		const byStory = new Map<string, PanelItem[]>();
		for (const item of filtered) {
			const list = byStory.get(item.Story) ?? [];
			list.push(item);
			byStory.set(item.Story, list);
		}
		const list: { Story: string; Name: string; Items: PanelItem[]; Newest: number }[] = [];
		byStory.forEach((storyItems, story) => {
			storyItems.sort((a, b) => a.Created > b.Created);
			list.push({ Story: story, Name: storyItems[0].StoryName, Items: storyItems, Newest: storyItems[0].Created });
		});
		list.sort((a, b) => a.Newest > b.Newest);
		return list;
	}, [items, filter, currentStory]);

	if (!open) return <></>;

	const setDone = (item: PanelItem, done: boolean) => {
		const changes = done ? { Resolved: true, ResolvedAt: os.time() } : { Resolved: false, Claimed: false, Seen: false };
		if (item.Kind === "comment") UpdateComment(item.Id, changes);
		else UpdateTweak(item.Id, changes);
	};
	const remove = (item: PanelItem) => {
		if (item.Kind === "comment") DeleteComments((c) => c.Id === item.Id);
		else DeleteTweaks((t) => t.Id === item.Id, true);
	};

	const smallButton = (key: string, label: string, onClick: () => void, color?: Color3) => (
		<textbutton
			key={key}
			Size={UDim2.fromOffset(label.size() * 7 + 14, 20)}
			BackgroundColor3={color ?? theme.ActionsPanel.TabHover}
			Text={label}
			TextColor3={color ? Color3.fromRGB(30, 30, 30) : theme.Text.Color}
			FontFace={FONT}
			TextSize={11}
			Event={{ Activated: onClick }}
		>
			<Corner Radius={4} />
		</textbutton>
	);

	const rows = new Map<string, React.Element>();
	let order = 0;
	for (const group of groups) {
		order++;
		rows.set(
			`H_${group.Story}`,
			<textlabel
				LayoutOrder={order}
				Size={new UDim2(1, 0, 0, 22)}
				BackgroundTransparency={1}
				Text={`${group.Name}  |  ${group.Items.size()}`}
				TextColor3={theme.Text.Color}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
				TextSize={13}
				TextXAlignment={Enum.TextXAlignment.Left}
			/>
		);
		for (const item of group.Items) {
			order++;
			const color = STATUS_COLORS[item.Status];
			const badge = item.Status === "Seen" && item.SeenBy !== undefined ? `Seen by ${item.SeenBy}` : item.Status;
			rows.set(
				`${item.Kind}_${item.Id}`,
				<textbutton
					LayoutOrder={order}
					Size={new UDim2(1, 0, 0, 0)}
					AutomaticSize={Enum.AutomaticSize.Y}
					BackgroundColor3={theme.ActionsPanel.TabsBackground}
					AutoButtonColor={true}
					Text={""}
					Event={{ Activated: () => OpenItem(item.Story, item.Page ? undefined : item.Element, item.Kind === "tweak" ? "tweak" : "comment") }}
				>
					<Corner Radius={6} />
					<uistroke Color={color} Thickness={1} Transparency={0.4} />
					<uipadding
						PaddingLeft={new UDim(0, 8)}
						PaddingRight={new UDim(0, 8)}
						PaddingTop={new UDim(0, 6)}
						PaddingBottom={new UDim(0, 6)}
					/>
					<uilistlayout Padding={new UDim(0, 3)} SortOrder={Enum.SortOrder.LayoutOrder} />
					<frame key={"Top"} LayoutOrder={1} Size={new UDim2(1, 0, 0, 18)} BackgroundTransparency={1}>
						<textlabel
							key={"Status"}
							Size={UDim2.fromOffset(badge.size() * 7 + 12, 16)}
							BackgroundColor3={color}
							Text={badge}
							TextColor3={Color3.fromRGB(30, 30, 30)}
							FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
							TextSize={10}
						>
							<Corner Radius={8} />
						</textlabel>
						<textlabel
							key={"Where"}
							Position={UDim2.fromOffset(badge.size() * 7 + 18, 0)}
							Size={new UDim2(1, -(badge.size() * 7 + 18) - 150, 1, 0)}
							BackgroundTransparency={1}
							Text={`${item.Kind === "tweak" ? "Tweak | " : ""}${item.Page ? "Whole page" : ShortPath(item.Element)}`}
							TextColor3={theme.Text.Disabled}
							FontFace={FONT}
							TextSize={11}
							TextXAlignment={Enum.TextXAlignment.Left}
							TextTruncate={Enum.TextTruncate.AtEnd}
						/>
						<frame
							key={"Actions"}
							AnchorPoint={new Vector2(1, 0)}
							Position={UDim2.fromScale(1, 0)}
							Size={UDim2.fromOffset(150, 20)}
							BackgroundTransparency={1}
						>
							<uilistlayout
								FillDirection={Enum.FillDirection.Horizontal}
								HorizontalAlignment={Enum.HorizontalAlignment.Right}
								VerticalAlignment={Enum.VerticalAlignment.Center}
								Padding={new UDim(0, 4)}
							/>
							<textlabel
								key={"A_Time"}
								Size={UDim2.fromOffset(52, 20)}
								BackgroundTransparency={1}
								Text={Ago(item.Created)}
								TextColor3={theme.Text.Disabled}
								FontFace={FONT}
								TextSize={10}
								TextXAlignment={Enum.TextXAlignment.Right}
							/>
							{item.Status === "Done"
								? smallButton("B_Reopen", "Reopen", () => setDone(item, false))
								: smallButton("B_Done", "Done", () => setDone(item, true))}
							{smallButton("C_Delete", "X", () => remove(item), Color3.fromRGB(255, 143, 143))}
						</frame>
					</frame>
					<textlabel
						key={"Text"}
						LayoutOrder={2}
						Size={new UDim2(1, 0, 0, 0)}
						AutomaticSize={Enum.AutomaticSize.Y}
						BackgroundTransparency={1}
						Text={item.Text}
						TextColor3={theme.Text.Color}
						FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Regular)}
						TextSize={13}
						TextWrapped={true}
						TextXAlignment={Enum.TextXAlignment.Left}
					/>
					{item.Note !== undefined && item.Note !== "" ? (
						<textlabel
							key={"Note"}
							LayoutOrder={3}
							Size={new UDim2(1, 0, 0, 0)}
							AutomaticSize={Enum.AutomaticSize.Y}
							BackgroundTransparency={1}
							Text={`AI: ${item.Note}`}
							TextColor3={color}
							FontFace={FONT}
							TextSize={12}
							TextWrapped={true}
							TextXAlignment={Enum.TextXAlignment.Left}
						/>
					) : undefined}
				</textbutton>
			);
		}
	}

	const openCount = items.filter((item) => item.Status !== "Done").size();
	const savePage = () => {
		if (!rootEntry) return;
		if (AddPageComment(rootEntry, draft)) {
			setDraft("");
			setComposing(false);
		}
	};
	const listTop = composing ? 128 : 60;

	return (
		<frame
			key={"CommentsPanel"}
			AnchorPoint={new Vector2(1, 0)}
			Position={new UDim2(1, -8, 0, 8)}
			Size={new UDim2(0, 420, 1, -16)}
			BackgroundColor3={theme.Dropdown.Color}
			Active={true}
			ZIndex={40}
		>
			<Corner Radius={8} />
			<uistroke Color={theme.Divisor.Color} Transparency={0.5} Thickness={1} />
			<uipadding
				PaddingLeft={new UDim(0, 10)}
				PaddingRight={new UDim(0, 10)}
				PaddingTop={new UDim(0, 8)}
				PaddingBottom={new UDim(0, 8)}
			/>
			<textlabel
				key={"Title"}
				Size={new UDim2(1, -156, 0, 24)}
				BackgroundTransparency={1}
				TextTruncate={Enum.TextTruncate.AtEnd}
				Text={`Comments & tweaks  |  ${openCount} open`}
				TextColor3={theme.Text.Color}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
				TextSize={15}
				TextXAlignment={Enum.TextXAlignment.Left}
			/>
			<textbutton
				key={"Close"}
				AnchorPoint={new Vector2(1, 0)}
				Position={UDim2.fromScale(1, 0)}
				Size={UDim2.fromOffset(24, 24)}
				BackgroundColor3={theme.ActionsPanel.TabHover}
				Text={"X"}
				TextColor3={theme.Text.Color}
				FontFace={FONT}
				TextSize={12}
				Event={{
					Activated: () => {
						setCommentsPanel(false);
						setPageComposer(false);
					}
				}}
			>
				<Corner Radius={4} />
			</textbutton>
			<textbutton
				key={"AddPage"}
				AnchorPoint={new Vector2(1, 0)}
				Position={new UDim2(1, -30, 0, 0)}
				Size={UDim2.fromOffset(118, 24)}
				BackgroundColor3={composing ? theme.StoryPreview.Selected : theme.ActionsPanel.TabHover}
				Text={"+ Page comment"}
				TextColor3={composing ? theme.StoryPreview.TextSelected : theme.Text.Color}
				FontFace={FONT}
				TextSize={12}
				Event={{ Activated: () => setComposing(!composing) }}
			>
				<Corner Radius={4} />
			</textbutton>
			{composing ? (
				<frame key={"Composer"} Position={UDim2.fromOffset(0, 60)} Size={new UDim2(1, 0, 0, 62)} BackgroundTransparency={1}>
					<textbox
						key={"Input"}
						ref={inputRef}
						Size={new UDim2(1, 0, 0, 34)}
						BackgroundColor3={theme.Search.Color}
						Text={draft}
						PlaceholderText={
							rootEntry
								? `About the whole ${RemoveExtension(rootEntry.Module.Name, Configs.Extensions.Story)} page (Enter to save)`
								: "Open a story first"
						}
						PlaceholderColor3={theme.Search.Placeholder}
						TextColor3={theme.Text.Color}
						FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Regular)}
						TextSize={13}
						TextWrapped={true}
						ClearTextOnFocus={false}
						TextEditable={rootEntry !== undefined}
						TextXAlignment={Enum.TextXAlignment.Left}
						TextYAlignment={Enum.TextYAlignment.Top}
						Change={{ Text: (box) => setDraft(box.Text) }}
						Event={{ FocusLost: (_, enter) => enter && savePage() }}
					>
						<Corner Radius={4} />
						<uipadding PaddingLeft={new UDim(0, 6)} PaddingTop={new UDim(0, 4)} PaddingRight={new UDim(0, 6)} />
					</textbox>
					<frame key={"Buttons"} Position={UDim2.fromOffset(0, 40)} Size={new UDim2(1, 0, 0, 20)} BackgroundTransparency={1}>
						<uilistlayout
							FillDirection={Enum.FillDirection.Horizontal}
							HorizontalAlignment={Enum.HorizontalAlignment.Right}
							Padding={new UDim(0, 6)}
						/>
						{smallButton("A_Cancel", "Cancel", () => setComposing(false))}
						{smallButton("B_Save", "Save", savePage, STATUS_COLORS.Done)}
					</frame>
				</frame>
			) : undefined}
			<frame key={"Filters"} Position={UDim2.fromOffset(0, 30)} Size={new UDim2(1, 0, 0, 22)} BackgroundTransparency={1}>
				<uilistlayout FillDirection={Enum.FillDirection.Horizontal} Padding={new UDim(0, 6)} SortOrder={Enum.SortOrder.LayoutOrder} />
				{FILTERS.map((name, index) => (
					<textbutton
						key={name}
						LayoutOrder={index}
						Size={UDim2.fromOffset(name.size() * 7 + 18, 22)}
						BackgroundColor3={filter === name ? theme.StoryPreview.Selected : theme.ActionsPanel.TabHover}
						Text={name}
						TextColor3={filter === name ? theme.StoryPreview.TextSelected : theme.Text.Color}
						FontFace={FONT}
						TextSize={12}
						Event={{ Activated: () => setFilter(name) }}
					>
						<Corner Radius={11} />
					</textbutton>
				))}
			</frame>
			<scrollingframe
				key={"List"}
				Position={UDim2.fromOffset(0, listTop)}
				Size={new UDim2(1, 0, 1, -listTop)}
				BackgroundTransparency={1}
				BorderSizePixel={0}
				ScrollBarThickness={4}
				AutomaticCanvasSize={Enum.AutomaticSize.Y}
				CanvasSize={new UDim2()}
			>
				<uilistlayout Padding={new UDim(0, 6)} SortOrder={Enum.SortOrder.LayoutOrder} />
				<uipadding PaddingRight={new UDim(0, 6)} />
				{rows.size() > 0 ? (
					rows
				) : (
					<textlabel
						Size={new UDim2(1, 0, 0, 40)}
						BackgroundTransparency={1}
						Text={"Nothing here. Use Comment For AI or Tweak Properties on a story."}
						TextColor3={theme.Text.Disabled}
						FontFace={FONT}
						TextSize={12}
						TextWrapped={true}
					/>
				)}
			</scrollingframe>
		</frame>
	);
}

export default CommentsPanel;
