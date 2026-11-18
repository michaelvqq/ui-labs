import React from "@rbxts/react";

import CommentTool from "./Buttons.tsx/CommentTool";
import Explorer from "./Buttons.tsx/Explorer";
import FullscreenMode from "./Buttons.tsx/FullscreenMode";
import GuiInset from "./Buttons.tsx/GuiInset";
import LightBackground from "./Buttons.tsx/LightBackground";
import MeasureTool from "./Buttons.tsx/MeasureTool";
import MouseRules from "./Buttons.tsx/MouseRules";
import PageComment from "./Buttons.tsx/PageComment";
import Reload from "./Buttons.tsx/Reload";
import SelectElements from "./Buttons.tsx/SelectElements";
import ShowOutlines from "./Buttons.tsx/ShowOutlines";
import TweakTool from "./Buttons.tsx/TweakTool";
import Viewport from "./Buttons.tsx/Viewport";
import ZoomIn from "./Buttons.tsx/ZoomIn";
import ZoomOut from "./Buttons.tsx/ZoomOut";

type ToolButtonsList = typeof ToolButtonsList;
export type ToolButtonType = ToolButtonsList[number]["Name"];

export interface ToolButtonProps {
	OnRightClick: () => void;

	PreviewEntry: PreviewEntry;
	ButtonName: ToolButtonType;
	Order: number;
}

interface ButtonListEntry {
	Name: ToolButtonType;
	DisplayName: string;
	Render: (props: ToolButtonProps) => React.Element;
}

export const ToolButtonsList = [
	{ Name: "Reload", Render: Reload, DisplayName: "Reload" },
	{ Name: "ZoomIn", Render: ZoomIn, DisplayName: "Zoom In" },
	{ Name: "ZoomOut", Render: ZoomOut, DisplayName: "Zoom Out" },
	{ Name: "ViewOnViewport", Render: Viewport, DisplayName: "View On Viewport" },
	{ Name: "ViewOnExplorer", Render: Explorer, DisplayName: "View On Explorer" },
	{ Name: "FullscreenMode", Render: FullscreenMode, DisplayName: "Fullscreen Mode" },
	{ Name: "GuiInset", Render: GuiInset, DisplayName: "GUI Inset" },
	{ Name: "LightBackground", Render: LightBackground, DisplayName: "Invert Background" },
	{ Name: "MeasureTool", Render: MeasureTool, DisplayName: "Measure Tool" },
	{ Name: "SelectElements", Render: SelectElements, DisplayName: "Select Elements" },
	{ Name: "CommentTool", Render: CommentTool, DisplayName: "Comment For AI" },
	{ Name: "PageComment", Render: PageComment, DisplayName: "Page Comment" },
	{ Name: "TweakTool", Render: TweakTool, DisplayName: "Tweak Properties" },
	{ Name: "ShowOutlines", Render: ShowOutlines, DisplayName: "Show Outlines" },
	{ Name: "MouseRules", Render: MouseRules, DisplayName: "Mouse Rules" }
] as const;

export const ToolButtonNames = ToolButtonsList.reduce(
	(old, button) => {
		old[button.Name] = button;
		return old;
	},
	{} as Record<ToolButtonType, ButtonListEntry>
);
