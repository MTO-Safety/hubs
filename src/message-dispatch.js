import "./utils/configs";
import { getAbsoluteHref } from "./utils/media-url-utils";
import { isValidSceneUrl } from "./utils/scene-url-utils";
import { messages } from "./utils/i18n";
import { SOUND_QUACK, SOUND_SPECIAL_QUACK } from "./systems/sound-effects-system";
import ducky from "./assets/models/DuckyMesh.glb";
import { spawnChatMessage, createInWorldLogMessage } from "./react-components/chat-message";

let uiRoot;
// Handles user-entered messages
export default class MessageDispatch {
  constructor(scene, entryManager, hubChannel, addToPresenceLog, remountUI, mediaSearchStore) {
    this.scene = scene;
    this.entryManager = entryManager;
    this.hubChannel = hubChannel;
    this.addToPresenceLog = addToPresenceLog;
    this.remountUI = remountUI;
    this.mediaSearchStore = mediaSearchStore;
  }

  log = body => {
    this.addToPresenceLog({ type: "log", body });
  };

  dispatch = message => {
    if (message.startsWith("/")) {
      const commandParts = message.substring(1).split(/\s+/);
      this.dispatchCommand(commandParts[0], ...commandParts.slice(1));
      document.activeElement.blur(); // Commands should blur
    } else {
      this.hubChannel.sendMessage(message);
    }
  };

  dispatchCommand = async (command, ...args) => {
    const entered = this.scene.is("entered");
    uiRoot = uiRoot || document.getElementById("ui-root");
    const isGhost = !entered && uiRoot && uiRoot.firstChild && uiRoot.firstChild.classList.contains("isGhost");

    if (!entered && (!isGhost || command === "duck")) {
      this.addToPresenceLog({ type: "log", body: "You must enter the room to use this command." });
      return;
    }

    const avatarRig = document.querySelector("#avatar-rig");
    const avatarPOV = document.getElementById("avatar-pov-node");
    const scales = [0.0625, 0.125, 0.25, 0.5, 1.0, 1.5, 3, 5, 7.5, 12.5];
    const curScale = avatarRig.object3D.scale;
    let err;
    let physicsSystem;
    const captureSystem = this.scene.systems["capture-system"];

    //---------------------- CUSTOM CODE -------------------------------
    function loadAssetFromURL(url, position) {
      const el = document.createElement("a-entity");
      AFRAME.scenes[0].appendChild(el);
      el.setAttribute("media-loader", { src: url, fitToBox: false, resolve: true });
      el.setAttribute("networked", { template: "#interactable-media" });
      el.setAttribute("position", position);
      return el;
    }

    // Credit to Utopiah https://gist.github.com/Utopiah/35407c28fd6ba2c2097d1b589630c53f
    function getAvatarFromName(name) {
      for (const a of document.querySelectorAll("[networked-avatar]")) {
        const el = document.querySelector("#" + a.id);
        if (name.trim() == el.components["player-info"].displayName.trim()) return el;
      }
      return null;
    }

    function attachObjToAvatar(obj, avatar, avatarPov) {
      NAF.utils.getNetworkedEntity(obj).then(networkedEl => {
        const mine = NAF.utils.isMine(networkedEl);
        if (!mine) var owned = NAF.utils.takeOwnership(networkedEl);
        // Set the position of the media at the same coordinates as the avatar
        networkedEl.object3D.position.copy(avatar.object3D.position);
        // Increase the height to 1.8
        networkedEl.object3D.position.y += 1.8;
        // Set the rotation so that the media has the same rotation as the avatar
        networkedEl.object3D.setRotationFromQuaternion(avatarPov.object3D.getWorldQuaternion());
        // Move the image back so it's in front of the avatar
        networkedEl.object3D.translateZ(-2);
      });
    }

    function setAvatarToHeight(avatar_rig, avatar_pov, newHeight) {
      const avatarHeight = avatar_pov.object3D.matrixWorld.elements[13] - avatar_rig.object3D.matrixWorld.elements[13];

      const avatarHeightFrac = avatarHeight / avatar_rig.object3D.scale.y;
      if (avatar_rig.components["player-info"].data.original_scale == null) {
        const start_scale = Object.assign({}, avatar_rig.object3D.scale);
        avatar_rig.updateComponent("player-info", { original_scale: start_scale });
      }
      avatar_rig.object3D.scale.set(
        newHeight / avatarHeightFrac - 0.3 / avatarHeightFrac,
        newHeight / avatarHeightFrac - 0.3 / avatarHeightFrac,
        newHeight / avatarHeightFrac - 0.3 / avatarHeightFrac
      );
      avatar_rig.object3D.matrixNeedsUpdate = true;
    }

    //------------------------------------------------------------------

    switch (command) {
      case "fly":
        if (this.scene.systems["hubs-systems"].characterController.fly) {
          this.scene.systems["hubs-systems"].characterController.enableFly(false);
          this.addToPresenceLog({ type: "log", body: "Fly mode disabled." });
        } else {
          if (this.scene.systems["hubs-systems"].characterController.enableFly(true)) {
            this.addToPresenceLog({ type: "log", body: "Fly mode enabled." });
          }
        }
        break;

      // -------------------------------- CUSTOM CODE FOR one to be able to set a specific height ---------------------------
      case "height":
        if (args[0]) {
          if (args[0] == "reset") {
            if (avatarRig.components["player-info"].data.original_scale != null) {
              avatarRig.object3D.scale.set(
                avatarRig.components["player-info"].data.original_scale.x,
                avatarRig.components["player-info"].data.original_scale.y,
                avatarRig.components["player-info"].data.original_scale.z
              );
              avatarRig.object3D.matrixNeedsUpdate = true;
            }
            break;
          } else if (args[0] == "show") {
            const avatarHeight =
              avatarPOV.object3D.matrixWorld.elements[13] - avatarRig.object3D.matrixWorld.elements[13];
            this.addToPresenceLog({
              type: "log",
              body: "Current avatar height : "
                .concat(Math.round((avatarHeight + 0.3 + Number.EPSILON) * 100) / 100)
                .concat("m")
            });
          } else if (args[0] > 1 && args[0] < 2.5) {
            // Calculate the current height of the avatar (source of method is a gist made by utophia)
            setAvatarToHeight(avatarRig, avatarPOV, args[0]);
          } else {
            this.addToPresenceLog({ type: "log", body: "Please enter a height within 1m - 2.5m" });
          }
          break;
        }
        break;
      // ------------------------------ CUSTOM CODE TO SPAWN IMAGE FROM CHAT ------------------------------------------------
      case "spawnimage": {
        let url, username, theAvatar, theAvatarPOV;
        if (args[0]) {
          url = args[0];
          if (args[1]) {
            // Spawn at the username entered
            username = args[1];
            theAvatar = getAvatarFromName(username);
            // Check if the avatar exists
            if (theAvatar) {
              // Gets the Point of View camera of the user
              theAvatarPOV = theAvatar.getElementsByClassName("camera")[0];
            } else {
              this.addToPresenceLog({ type: "log", body: "Error: Can't find username." });
              break;
            }
          } else {
            // If no username is entered, spawn at the user who typed the command
            username = avatarRig.components["player-info"]["displayName"];
            theAvatar = getAvatarFromName(username);
            // Gets the Point of View camera of the user
            theAvatarPOV = theAvatar.getElementsByClassName("camera")[0];
          }
          // Spawn the image
          const newImage = loadAssetFromURL(url, "0 0 0");
          // Move it to the avatar
          attachObjToAvatar(newImage, theAvatar, theAvatarPOV);
        } else {
          this.addToPresenceLog({ type: "log", body: "Error: You must enter a URL to media." });
        }
        break;
      }
      // --------------------------------------------------------------------------------------------------------------------
      // -----------------------------------------CUSTOM CODE TO LET ONE SEE DISTANCE TO SHARED SCREENS----------------------
      case "distancetoscreen":
        const media_loaders = AFRAME.scenes[0].querySelectorAll("[media-video]");
        let selectedScreen = null;
        let selectedAvatar = avatarRig;
        let selectedAvatarName = "";
        // If user desires to get distance between another user and their screen
        if (args[0]) {
          selectedAvatar = getAvatarFromName(args[0]);
          if (selectedAvatar == null) {
            this.addToPresenceLog({
              type: "log",
              body: "Could not find player named: ".concat(args[0])
            });
            break;
          }
          for (let media_loader of media_loaders) {
            // Find the screen belonging to the user
            const creatorID = NAF.utils.getCreator(media_loader);
            if (selectedAvatar.components["player-info"].playerSessionId === creatorID) {
              selectedScreen = media_loader;
            }
          }
          selectedAvatarName = " for ".concat(selectedAvatar.components["player-info"].displayName);
        }
        // If user desires to get distance to their own screen
        else {
          for (let media_loader of media_loaders) {
            const creatorID = NAF.utils.getCreator(media_loader);
            if (selectedAvatar.components["player-info"].playerSessionId === creatorID) {
              selectedScreen = media_loader;
            }
          }
        }
        if (selectedScreen == null || selectedAvatar == null) break;
        // To get the correnct height, use the camera of the user
        let selecterAvatarCamera;
        for (let child of selectedAvatar.getChildren()) {
          if (child.className == "camera") selecterAvatarCamera = child;
        }
        // Calculate the distance and turn it into centimeters
        let distance = selecterAvatarCamera.object3D
          .getWorldPosition()
          .distanceTo(selectedScreen.object3D.getWorldPosition());
        distance = Math.round(distance * 100);
        this.hubChannel.sendMessage(
          "Distance"
            .concat(selectedAvatarName)
            .concat(": ")
            .concat(distance)
            .concat(" cm")
        );

        break;

      // -------------------------------------------------------------------------------------------------------------------
      case "grow":
        for (let i = 0; i < scales.length; i++) {
          if (scales[i] > curScale.x) {
            avatarRig.object3D.scale.set(scales[i], scales[i], scales[i]);
            avatarRig.object3D.matrixNeedsUpdate = true;
            break;
          }
        }

        break;
      case "shrink":
        for (let i = scales.length - 1; i >= 0; i--) {
          if (curScale.x > scales[i]) {
            avatarRig.object3D.scale.set(scales[i], scales[i], scales[i]);
            avatarRig.object3D.matrixNeedsUpdate = true;
            break;
          }
        }

        break;
      case "leave":
        this.entryManager.exitScene();
        this.remountUI({ roomUnavailableReason: "left" });
        break;
      case "duck":
        spawnChatMessage(getAbsoluteHref(location.href, ducky));
        if (Math.random() < 0.01) {
          this.scene.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_SPECIAL_QUACK);
        } else {
          this.scene.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_QUACK);
        }
        break;
      case "debug":
        physicsSystem = document.querySelector("a-scene").systems["hubs-systems"].physicsSystem;
        physicsSystem.setDebug(!physicsSystem.debugEnabled);
        break;
      case "vrstats":
        document.getElementById("stats").components["stats-plus"].toggleVRStats();
        break;
      case "scene":
        if (args[0]) {
          if (await isValidSceneUrl(args[0])) {
            err = this.hubChannel.updateScene(args[0]);
            if (err === "unauthorized") {
              this.addToPresenceLog({ type: "log", body: "You do not have permission to change the scene." });
            }
          } else {
            this.addToPresenceLog({ type: "log", body: messages["invalid-scene-url"] });
          }
        } else if (this.hubChannel.canOrWillIfCreator("update_hub")) {
          this.mediaSearchStore.sourceNavigateWithNoNav("scenes", "use");
        }

        break;
      case "rename":
        err = this.hubChannel.rename(args.join(" "));
        if (err === "unauthorized") {
          this.addToPresenceLog({ type: "log", body: "You do not have permission to rename this room." });
        }
        break;
      case "capture":
        if (!captureSystem.available()) {
          this.log("Capture unavailable.");
          break;
        }
        if (args[0] === "stop") {
          if (captureSystem.started()) {
            captureSystem.stop();
            this.log("Capture stopped.");
          } else {
            this.log("Capture already stopped.");
          }
        } else {
          if (captureSystem.started()) {
            this.log("Capture already running.");
          } else {
            captureSystem.start();
            this.log("Capture started.");
          }
        }
        break;
      case "audiomode":
        {
          const shouldEnablePositionalAudio = window.APP.store.state.preferences.audioOutputMode === "audio";
          window.APP.store.update({
            preferences: { audioOutputMode: shouldEnablePositionalAudio ? "panner" : "audio" }
          });
          this.log(`Positional Audio ${shouldEnablePositionalAudio ? "enabled" : "disabled"}.`);
        }
        break;
    }
  };
}
