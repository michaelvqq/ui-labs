import React, { useEffect, useState } from "@rbxts/react";
import { GetSimulatedInset, SimulatedInset } from "Agent/AgentInset";

interface InsetOverlayProps {
	Entry: PreviewEntry;
}

const BAR = Color3.fromRGB(20, 20, 24);
const SAFE = Color3.fromRGB(255, 70, 70);
const FONT = Font.fromName("GothamSSm", Enum.FontWeight.Bold);

function MockButton(props: { Key: string; Order: number; Label: string; Size: number }) {
	return (
		<frame
			key={props.Key}
			LayoutOrder={props.Order}
			Size={UDim2.fromOffset(props.Size, props.Size)}
			BackgroundColor3={Color3.fromRGB(0, 0, 0)}
			BackgroundTransparency={0.35}
		>
			<uicorner CornerRadius={new UDim(0.5, 0)} />
			<textlabel
				Size={UDim2.fromScale(1, 1)}
				BackgroundTransparency={1}
				Text={props.Label}
				TextColor3={new Color3(1, 1, 1)}
				FontFace={FONT}
				TextSize={math.floor(props.Size * 0.32)}
			/>
		</frame>
	);
}

// Roblox top bar + device safe areas over the story (click-through; included in captures)
function InsetOverlay(props: InsetOverlayProps) {
	const [inset, setInset] = useState<SimulatedInset | undefined>(() => GetSimulatedInset(props.Entry));

	useEffect(() => {
		setInset(GetSimulatedInset(props.Entry));
		const listener = props.Entry.ListenerFrame;
		if (!listener) return;
		const connection = listener
			.GetPropertyChangedSignal("AbsoluteSize")
			.Connect(() => setInset(GetSimulatedInset(props.Entry)));
		return () => connection.Disconnect();
	}, [props.Entry]);

	if (!inset) return <></>;
	const bar = inset.TopbarHeight;
	const button = math.floor(bar * 0.76);
	const pad = math.floor((bar - button) / 2);
	const safe = inset.SafeArea;

	const shade = (key: string, position: UDim2, size: UDim2, label?: string) => (
		<frame key={key} Position={position} Size={size} BackgroundColor3={SAFE} BackgroundTransparency={0.7} BorderSizePixel={0} ZIndex={2}>
			{label !== undefined ? (
				<textlabel
					Size={UDim2.fromScale(1, 1)}
					BackgroundTransparency={1}
					Text={label}
					TextColor3={new Color3(1, 1, 1)}
					FontFace={FONT}
					TextSize={10}
					TextWrapped={true}
				/>
			) : undefined}
		</frame>
	);

	return (
		<frame key={"AILabsGuiInset"} Size={UDim2.fromScale(1, 1)} BackgroundTransparency={1} ZIndex={100}>
			<frame
				key={"Topbar"}
				Size={new UDim2(1, 0, 0, bar)}
				BackgroundColor3={BAR}
				BackgroundTransparency={0.55}
				BorderSizePixel={0}
				ZIndex={3}
			>
				<uistroke Color={Color3.fromRGB(255, 196, 61)} Thickness={1} Transparency={0.2} />
				<frame
					key={"Left"}
					Position={UDim2.fromOffset(pad + safe.Left, pad)}
					Size={UDim2.fromOffset(button * 3 + 16, button)}
					BackgroundTransparency={1}
				>
					<uilistlayout FillDirection={Enum.FillDirection.Horizontal} Padding={new UDim(0, 8)} SortOrder={Enum.SortOrder.LayoutOrder} />
					<MockButton Key={"Logo"} Order={1} Label={"R"} Size={button} />
					<MockButton Key={"Menu"} Order={2} Label={"="} Size={button} />
					<MockButton Key={"Chat"} Order={3} Label={"..."} Size={button} />
				</frame>
				<frame
					key={"Right"}
					AnchorPoint={new Vector2(1, 0)}
					Position={new UDim2(1, -(pad + safe.Right), 0, pad)}
					Size={UDim2.fromOffset(button, button)}
					BackgroundTransparency={1}
				>
					<MockButton Key={"Settings"} Order={1} Label={"o"} Size={button} />
				</frame>
				<textlabel
					key={"Label"}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={UDim2.fromScale(0.5, 0.5)}
					Size={UDim2.fromOffset(240, 14)}
					BackgroundTransparency={1}
					Text={`GUI inset ${bar}px (${inset.Device === "desktop" ? "desktop" : "phone"})`}
					TextColor3={Color3.fromRGB(255, 196, 61)}
					FontFace={FONT}
					TextSize={11}
				/>
			</frame>
			{safe.Left > 0 ? shade("SafeLeft", UDim2.fromOffset(0, 0), new UDim2(0, safe.Left, 1, 0), "notch") : undefined}
			{safe.Right > 0
				? shade("SafeRight", new UDim2(1, -safe.Right, 0, 0), new UDim2(0, safe.Right, 1, 0))
				: undefined}
			{safe.Top > 0 ? shade("SafeTop", UDim2.fromOffset(0, 0), new UDim2(1, 0, 0, safe.Top), "notch") : undefined}
			{safe.Bottom > 0
				? shade("SafeBottom", new UDim2(0, 0, 1, -safe.Bottom), new UDim2(1, 0, 0, safe.Bottom), "home indicator")
				: undefined}
		</frame>
	);
}

export default InsetOverlay;
