import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { useEffect, useState } from "@rbxts/react";
import { ActivityChanged, ActivityEntry } from "Agent/AgentActivity";
import Corner from "UI/Styles/Corner";

const ACCENT = Color3.fromRGB(255, 92, 168);
const SHOW_FOR = 8;

// "AI: clicked Mutation" line at the top of the AI Labs window while an agent is driving it
function AIActivity() {
	const [entry, setEntry] = useState<ActivityEntry>();
	const [visible, setVisible] = useState(false);

	useEventListener(ActivityChanged, (latest) => {
		setEntry(latest);
		setVisible(true);
	});

	useEffect(() => {
		if (!entry) return;
		const thread = task.delay(SHOW_FOR, () => setVisible(false));
		return () => task.cancel(thread);
	}, [entry]);

	if (!entry || !visible) return <></>;
	return (
		<frame
			key={"AIActivity"}
			AnchorPoint={new Vector2(0.5, 0)}
			Position={new UDim2(0.5, 0, 0, 6)}
			Size={UDim2.fromOffset(0, 24)}
			AutomaticSize={Enum.AutomaticSize.X}
			BackgroundColor3={Color3.fromRGB(28, 22, 30)}
			BackgroundTransparency={0.05}
			ZIndex={50}
		>
			<Corner Radius={12} />
			<uistroke Color={ACCENT} Thickness={1} />
			<uipadding PaddingLeft={new UDim(0, 4)} PaddingRight={new UDim(0, 10)} />
			<uilistlayout
				FillDirection={Enum.FillDirection.Horizontal}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				Padding={new UDim(0, 6)}
			/>
			<textlabel
				key={"Badge"}
				LayoutOrder={1}
				Size={UDim2.fromOffset(26, 18)}
				BackgroundColor3={ACCENT}
				Text={"AI"}
				TextColor3={new Color3(1, 1, 1)}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
				TextSize={11}
			>
				<Corner Radius={9} />
			</textlabel>
			<textlabel
				key={"Text"}
				LayoutOrder={2}
				Size={UDim2.fromOffset(0, 18)}
				AutomaticSize={Enum.AutomaticSize.X}
				BackgroundTransparency={1}
				Text={entry.Text}
				TextColor3={new Color3(1, 1, 1)}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Medium)}
				TextSize={13}
			/>
		</frame>
	);
}

export default AIActivity;
