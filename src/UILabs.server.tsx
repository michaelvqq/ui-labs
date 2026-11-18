_G.__ROACT_17_MOCK_SCHEDULER__ = undefined;

import React from "@rbxts/react";
import { ReflexProvider } from "@rbxts/react-reflex";
import { Root, createLegacyRoot, createPortal } from "@rbxts/react-roblox";
import { RunService } from "@rbxts/services";
import { StartAgentBridge } from "Agent/AgentBridge";
import { SetCommentsPlugin } from "Agent/AgentComments";
import { SetTweaksPlugin, StartTweakApplier } from "Agent/AgentTweaks";
import { RootProducer } from "Reflex";
import Plugin from "UI/Plugin";
import { Div } from "UI/Styles/Div";
import { IsCanaryPlugin, IsLocalPlugin } from "Utils/MiscUtils";

if (!RunService.IsRunning() || RunService.IsEdit()) {
	const isLocal = IsLocalPlugin(plugin);
	const isCanary = IsCanaryPlugin(plugin);

	const toolbar = plugin.CreateToolbar("AI Labs");
	const pluginButton = toolbar.CreateButton(
		"AI Labs",
		"Open AI Labs",
		isLocal ? "rbxassetid://16652065460" : isCanary ? "rbxassetid://88856573487980" : "rbxassetid://13858107432"
	);
	const stopButton = toolbar.CreateButton("Stop", "Stop AI Labs", "rbxassetid://13960086023");

	pluginButton.ClickableWhenViewportHidden = true;
	stopButton.ClickableWhenViewportHidden = true;

	const dockWidget = plugin.CreateDockWidgetPluginGui(
		isLocal ? "UILabs_DEV" : "UILabs",
		new DockWidgetPluginGuiInfo(Enum.InitialDockState.Float, false, false, 0, 0)
	);

	dockWidget.Title = "AI Labs - Storybook";
	dockWidget.Name = isLocal ? "UILabs(DEV)" : "UILabs";
	dockWidget.ZIndexBehavior = Enum.ZIndexBehavior.Sibling;
	let isOpen = false;

	let pluginRoot: Root | undefined = undefined;

	const buttonConnection = pluginButton.Click.Connect(() => {
		dockWidget.Enabled = !dockWidget.Enabled;
	});
	const stopConnection = stopButton.Click.Connect(() => {
		stopButton.SetActive(false);
		dockWidget.Enabled = false;
		if (pluginRoot) {
			pluginRoot.unmount();
			pluginRoot = undefined;
			RootProducer.resetState();
		}
	});

	// Mounts the app (even while the window is closed, so the agent bridge can drive it headless)
	const ensureRoot = () => {
		if (!pluginRoot) {
			const pluginApp = (
				<ReflexProvider producer={RootProducer}>
					<Div key={"App"}>
						<Plugin Plugin={plugin} DockWidget={dockWidget}></Plugin>
					</Div>
				</ReflexProvider>
			);

			pluginRoot = createLegacyRoot(new Instance("Folder"));
			pluginRoot.render(createPortal(pluginApp, dockWidget));
		}
	};

	const onDockWidgetToggled = () => {
		pluginButton.SetActive(dockWidget.Enabled);
		isOpen = dockWidget.Enabled;
		if (dockWidget.Enabled) ensureRoot();
	};

	SetCommentsPlugin(plugin);
	SetTweaksPlugin(plugin);
	const stopTweakApplier = StartTweakApplier();
	const stopAgentBridge = StartAgentBridge({ Plugin: plugin, DockWidget: dockWidget, EnsureRoot: ensureRoot });

	dockWidget.BindToClose(() => {
		dockWidget.Enabled = false;
	});

	const dockEnableConnection = dockWidget.GetPropertyChangedSignal("Enabled").Connect(onDockWidgetToggled);
	onDockWidgetToggled();

	plugin.Unloading.Connect(() => {
		if (pluginRoot) {
			pluginRoot.unmount();
		}
		RootProducer.resetState();
		stopAgentBridge();
		stopTweakApplier();
		buttonConnection.Disconnect();
		stopConnection.Disconnect();
		dockEnableConnection.Disconnect();
	});
}
