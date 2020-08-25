import { paths } from "./userinput/paths";
import { SOUND_SNAP_ROTATE, SOUND_WAYPOINT_START, SOUND_WAYPOINT_END } from "./sound-effects-system";
import { easeOutQuadratic } from "../utils/easing";
import { getPooledMatrix4, freePooledMatrix4 } from "../utils/mat4-pool";
import { waitForDOMContentLoaded } from "../utils/async-utils";
import {
  childMatch,
  rotateInPlaceAroundWorldUp,
  calculateCameraTransformForWaypoint,
  interpolateAffine,
  affixToWorldUp
} from "../utils/three-utils";
import { getCurrentPlayerHeight } from "../utils/get-current-player-height";
import qsTruthy from "../utils/qs_truthy";
//import { m4String } from "../utils/pretty-print";
const NAV_ZONE = "character";
const qsAllowWaypointLerp = qsTruthy("waypointLerp");
const isMobile = AFRAME.utils.device.isMobile();

const calculateDisplacementToDesiredPOV = (function() {
  const translationCoordinateSpace = new THREE.Matrix4();
  const translated = new THREE.Matrix4();
  const localTranslation = new THREE.Matrix4();
  return function calculateDisplacementToDesiredPOV(
    povMat4,
    allowVerticalMovement,
    localDisplacement,
    displacementToDesiredPOV
  ) {
    localTranslation.makeTranslation(localDisplacement.x, localDisplacement.y, localDisplacement.z);
    translationCoordinateSpace.extractRotation(povMat4);
    if (!allowVerticalMovement) {
      affixToWorldUp(translationCoordinateSpace, translationCoordinateSpace);
    }
    translated.copy(translationCoordinateSpace).multiply(localTranslation);
    return displacementToDesiredPOV.setFromMatrixPosition(translated);
  };
})();

/**
 * A character controller that moves the avatar.
 * The controller accounts for playspace offset and orientation and depends on the nav mesh system for translation.
 * @namespace avatar
 */

const SNAP_ROTATION_RADIAN = THREE.Math.DEG2RAD * 45;
const BASE_SPEED = 3.2; //TODO: in what units?
export class CharacterControllerSystem {
  constructor(scene) {
    this.controllerDeskCounter = 0;
    this.deskTrackController = false;
    this.scene = scene;
    this.fly = false;
    this.shouldLandWhenPossible = false;
    this.waypoints = [];
    this.waypointTravelStartTime = 0;
    this.waypointTravelTime = 0;
    this.navGroup = null;
    this.navNode = null;
    this.relativeMotion = new THREE.Vector3(0, 0, 0);
    this.nextRelativeMotion = new THREE.Vector3(0, 0, 0);
    this.dXZ = 0;
    this.scene.addEventListener("nav-mesh-loaded", () => {
      this.navGroup = null;
      this.navNode = null;
    });
    waitForDOMContentLoaded().then(() => {
      this.avatarPOV = document.getElementById("avatar-pov-node");
      this.avatarRig = document.getElementById("avatar-rig");
    });
  }
  // Use this API for waypoint travel so that your matrix doesn't end up in the pool
  enqueueWaypointTravelTo(inTransform, isInstant, waypointComponentData) {
    this.waypoints.push({ transform: getPooledMatrix4().copy(inTransform), isInstant, waypointComponentData }); //TODO: don't create new object
  }
  enqueueRelativeMotion(motion) {
    motion.z *= -1;
    this.relativeMotion.add(motion);
  }
  enqueueInPlaceRotationAroundWorldUp(dXZ) {
    this.dXZ += dXZ;
  }
  // We assume the rig is at the root, and its local position === its world position.
  teleportTo = (function() {
    const rig = new THREE.Vector3();
    const head = new THREE.Vector3();
    const deltaFromHeadToTargetForHead = new THREE.Vector3();
    const targetForHead = new THREE.Vector3();
    const targetForRig = new THREE.Vector3();
    //TODO: Use enqueue waypoint
    return function teleportTo(targetWorldPosition) {
      this.isMotionDisabled = false;
      this.avatarRig.object3D.getWorldPosition(rig);
      this.avatarPOV.object3D.getWorldPosition(head);
      targetForHead.copy(targetWorldPosition);
      targetForHead.y += this.avatarPOV.object3D.position.y;
      deltaFromHeadToTargetForHead.copy(targetForHead).sub(head);
      targetForRig.copy(rig).add(deltaFromHeadToTargetForHead);
      const navMeshExists = NAV_ZONE in this.scene.systems.nav.pathfinder.zones;
      this.findPositionOnNavMesh(targetForRig, targetForRig, this.avatarRig.object3D.position, navMeshExists);
      this.avatarRig.object3D.matrixNeedsUpdate = true;
    };
  })();

  travelByWaypoint = (function() {
    const inMat4Copy = new THREE.Matrix4();
    const inPosition = new THREE.Vector3();
    const outPosition = new THREE.Vector3();
    const translation = new THREE.Matrix4();
    const initialOrientation = new THREE.Matrix4();
    const finalScale = new THREE.Vector3();
    const finalPosition = new THREE.Vector3();
    const finalPOV = new THREE.Matrix4();
    return function travelByWaypoint(inMat4, snapToNavMesh, willMaintainInitialOrientation) {
      this.avatarPOV.object3D.updateMatrices();
      if (!this.fly && !snapToNavMesh) {
        this.fly = true;
        this.shouldLandWhenPossible = true;
        this.shouldUnoccupyWaypointsOnceMoving = true;
      }
      inMat4Copy.copy(inMat4);
      rotateInPlaceAroundWorldUp(inMat4Copy, Math.PI, finalPOV);
      const navMeshExists = NAV_ZONE in this.scene.systems.nav.pathfinder.zones;
      if (!navMeshExists && snapToNavMesh) {
        console.warn("Tried to travel to a waypoint that wants to snap to the nav mesh, but there is no nav mesh");
      }
      if (navMeshExists && snapToNavMesh) {
        inPosition.setFromMatrixPosition(inMat4Copy);
        this.findPositionOnNavMesh(inPosition, inPosition, outPosition, true);
        finalPOV.setPosition(outPosition);
      }
      translation.makeTranslation(0, getCurrentPlayerHeight(), -0.15);
      finalPOV.multiply(translation);
      if (willMaintainInitialOrientation) {
        initialOrientation.extractRotation(this.avatarPOV.object3D.matrixWorld);
        finalScale.setFromMatrixScale(finalPOV);
        finalPosition.setFromMatrixPosition(finalPOV);
        finalPOV
          .copy(initialOrientation)
          .scale(finalScale)
          .setPosition(finalPosition);
      }
      calculateCameraTransformForWaypoint(this.avatarPOV.object3D.matrixWorld, finalPOV, finalPOV);
      childMatch(this.avatarRig.object3D, this.avatarPOV.object3D, finalPOV);
    };
  })();
  // ------------------ CUSTOM CODE -------------------------------------------
  distanceToDesk = function(character_pos, desk) {
    // euclidean distance along x and z axis
    const desk_pos = desk.getWorldPosition();
    const x_distance = character_pos.x - desk_pos.x;
    const z_distance = character_pos.z - desk_pos.z;
    return Math.sqrt(x_distance * x_distance + z_distance * z_distance);
  };
  getClosestDesk = function(avatarPos, deskList) {
    // Sort the interactable desks by euclidean distance
    const sorted_interactable_desks = deskList.sort(function(a, b) {
      return (
        Math.sqrt(
          Math.pow(avatarPos.x - a.object3D.getWorldPosition().x, 2) +
            Math.pow(avatarPos.z - a.object3D.getWorldPosition().z, 2)
        ) -
        Math.sqrt(
          Math.pow(avatarPos.x - b.object3D.getWorldPosition().x, 2) +
            Math.pow(avatarPos.z - b.object3D.getWorldPosition().z, 2)
        )
      );
    });
    return sorted_interactable_desks[0];
  };

  raiseDesk = (desk, deltaPos) => {
    desk.object3D.translateY(deltaPos);
    desk.currentHeightOffset += deltaPos;
    desk.invisible_desk.object3D.translateY(deltaPos);
  };

  // -------------------------------------------------------------------------
  tick = (function() {
    const snapRotatedPOV = new THREE.Matrix4();
    const newPOV = new THREE.Matrix4();
    const displacementToDesiredPOV = new THREE.Vector3();

    const startPOVPosition = new THREE.Vector3();
    const desiredPOVPosition = new THREE.Vector3();
    const navMeshSnappedPOVPosition = new THREE.Vector3();
    const AVERAGE_WAYPOINT_TRAVEL_SPEED_METERS_PER_SECOND = 50;
    const startTransform = new THREE.Matrix4();
    const interpolatedWaypoint = new THREE.Matrix4();
    const startTranslation = new THREE.Matrix4();
    const waypointPosition = new THREE.Vector3();
    const v = new THREE.Vector3();

    let uiRoot;
    return function tick(t, dt) {
      const entered = this.scene.is("entered");
      uiRoot = uiRoot || document.getElementById("ui-root");
      const isGhost = !entered && uiRoot && uiRoot.firstChild && uiRoot.firstChild.classList.contains("isGhost");
      if (!isGhost && !entered) return;
      const vrMode = this.scene.is("vr-mode");
      this.sfx = this.sfx || this.scene.systems["hubs-systems"].soundEffectsSystem;
      this.waypointSystem = this.waypointSystem || this.scene.systems["hubs-systems"].waypointSystem;

      if (!this.activeWaypoint && this.waypoints.length) {
        this.activeWaypoint = this.waypoints.splice(0, 1)[0];
        // Normally, do not disable motion on touchscreens because there is no way to teleport out of it.
        // But if motion AND teleporting is disabled, then disable motion because the waypoint author
        // intended for the user to be stuck here.
        this.isMotionDisabled =
          this.activeWaypoint.waypointComponentData.willDisableMotion &&
          (!isMobile || this.activeWaypoint.waypointComponentData.willDisableTeleporting);
        this.isTeleportingDisabled = this.activeWaypoint.waypointComponentData.willDisableTeleporting;
        this.avatarPOV.object3D.updateMatrices();
        this.waypointTravelTime =
          (vrMode && !qsAllowWaypointLerp) || this.activeWaypoint.isInstant
            ? 0
            : 1000 *
              (new THREE.Vector3()
                .setFromMatrixPosition(this.avatarPOV.object3D.matrixWorld)
                .distanceTo(waypointPosition.setFromMatrixPosition(this.activeWaypoint.transform)) /
                AVERAGE_WAYPOINT_TRAVEL_SPEED_METERS_PER_SECOND);
        rotateInPlaceAroundWorldUp(this.avatarPOV.object3D.matrixWorld, Math.PI, startTransform);
        startTransform.multiply(startTranslation.makeTranslation(0, -1 * getCurrentPlayerHeight(), -0.15));
        this.waypointTravelStartTime = t;
        if (!vrMode && this.waypointTravelTime > 100) {
          this.sfx.playSoundOneShot(SOUND_WAYPOINT_START);
        }
      }

      const animationIsOver =
        this.waypointTravelTime === 0 || t >= this.waypointTravelStartTime + this.waypointTravelTime;
      if (this.activeWaypoint && !animationIsOver) {
        const progress = THREE.Math.clamp((t - this.waypointTravelStartTime) / this.waypointTravelTime, 0, 1);
        interpolateAffine(
          startTransform,
          this.activeWaypoint.transform,
          easeOutQuadratic(progress),
          interpolatedWaypoint
        );
        this.travelByWaypoint(
          interpolatedWaypoint,
          false,
          this.activeWaypoint.waypointComponentData.willMaintainInitialOrientation
        );
      }
      if (this.activeWaypoint && (this.waypoints.length || animationIsOver)) {
        this.travelByWaypoint(
          this.activeWaypoint.transform,
          this.activeWaypoint.waypointComponentData.snapToNavMesh,
          this.activeWaypoint.waypointComponentData.willMaintainInitialOrientation
        );
        freePooledMatrix4(this.activeWaypoint.transform);
        this.activeWaypoint = null;
        if (vrMode || this.waypointTravelTime > 0) {
          this.sfx.playSoundOneShot(SOUND_WAYPOINT_END);
        }
      }

      const userinput = AFRAME.scenes[0].systems.userinput;
      const wasFlying = this.fly;
      if (userinput.get(paths.actions.toggleFly)) {
        this.shouldLandWhenPossible = false;
        this.avatarRig.messageDispatch.dispatch("/fly"); // TODO: Separate the logic about displaying the message from toggling the fly state in such a way that it is clear that this.fly will be toggled here
      }
      const didStopFlying = wasFlying && !this.fly;
      if (!this.fly && this.shouldLandWhenPossible) {
        this.shouldLandWhenPossible = false;
      }
      if (this.fly) {
        this.navNode = null;
      }
      const preferences = window.APP.store.state.preferences;
      const snapRotateLeft = userinput.get(paths.actions.snapRotateLeft);
      const snapRotateRight = userinput.get(paths.actions.snapRotateRight);
      if (snapRotateLeft) {
        this.dXZ +=
          preferences.snapRotationDegrees === undefined
            ? SNAP_ROTATION_RADIAN
            : (preferences.snapRotationDegrees * Math.PI) / 180;
      }
      if (snapRotateRight) {
        this.dXZ -=
          preferences.snapRotationDegrees === undefined
            ? SNAP_ROTATION_RADIAN
            : (preferences.snapRotationDegrees * Math.PI) / 180;
      }
      if (snapRotateLeft || snapRotateRight) {
        this.scene.systems["hubs-systems"].soundEffectsSystem.playSoundOneShot(SOUND_SNAP_ROTATE);
      }
      const characterAcceleration = userinput.get(paths.actions.characterAcceleration);
      if (characterAcceleration) {
        const zCharacterAcceleration = -1 * characterAcceleration[1];
        this.relativeMotion.set(
          this.relativeMotion.x +
            (preferences.disableMovement || preferences.disableStrafing ? 0 : characterAcceleration[0]),
          this.relativeMotion.y,
          this.relativeMotion.z +
            (preferences.disableMovement
              ? 0
              : preferences.disableBackwardsMovement
                ? Math.min(0, zCharacterAcceleration)
                : zCharacterAcceleration)
        );
      }
      const lerpC = vrMode ? 0 : 0.85; // TODO: To support drifting ("ice skating"), motion needs to keep initial direction
      this.nextRelativeMotion.copy(this.relativeMotion).multiplyScalar(lerpC);
      this.relativeMotion.multiplyScalar(1 - lerpC);

      this.avatarPOV.object3D.updateMatrices();
      rotateInPlaceAroundWorldUp(this.avatarPOV.object3D.matrixWorld, this.dXZ, snapRotatedPOV);

      newPOV.copy(snapRotatedPOV);

      const navMeshExists = NAV_ZONE in this.scene.systems.nav.pathfinder.zones;
      if (!this.isMotionDisabled) {
        const playerScale = v.setFromMatrixColumn(this.avatarPOV.object3D.matrixWorld, 1).length();
        const triedToMove = this.relativeMotion.lengthSq() > 0.000001;

        if (triedToMove) {
          const speedModifier = preferences.movementSpeedModifier || 1;
          calculateDisplacementToDesiredPOV(
            snapRotatedPOV,
            this.fly || !navMeshExists,
            this.relativeMotion.multiplyScalar(
              ((userinput.get(paths.actions.boost) ? 2 : 1) *
                speedModifier *
                BASE_SPEED *
                Math.sqrt(playerScale) *
                dt) /
                1000
            ),
            displacementToDesiredPOV
          );

          newPOV
            .makeTranslation(displacementToDesiredPOV.x, displacementToDesiredPOV.y, displacementToDesiredPOV.z)
            .multiply(snapRotatedPOV);
        }

        const shouldRecomputeNavGroupAndNavNode = didStopFlying || this.shouldLandWhenPossible;
        const shouldResnapToNavMesh = navMeshExists && (shouldRecomputeNavGroupAndNavNode || triedToMove);

        let squareDistNavMeshCorrection = 0;

        if (shouldResnapToNavMesh) {
          this.findPOVPositionAboveNavMesh(
            startPOVPosition.setFromMatrixPosition(this.avatarPOV.object3D.matrixWorld),
            desiredPOVPosition.setFromMatrixPosition(newPOV),
            navMeshSnappedPOVPosition,
            shouldRecomputeNavGroupAndNavNode
          );

          squareDistNavMeshCorrection = desiredPOVPosition.distanceToSquared(navMeshSnappedPOVPosition);

          if (this.fly && this.shouldLandWhenPossible && squareDistNavMeshCorrection < 0.5 && !this.activeWaypoint) {
            this.shouldLandWhenPossible = false;
            this.fly = false;
            newPOV.setPosition(navMeshSnappedPOVPosition);
          } else if (!this.fly) {
            newPOV.setPosition(navMeshSnappedPOVPosition);
          }
        }

        if (!this.activeWaypoint && this.shouldUnoccupyWaypointsOnceMoving && triedToMove) {
          this.shouldUnoccupyWaypointsOnceMoving = false;
          this.waypointSystem.releaseAnyOccupiedWaypoints();
          if (this.fly && this.shouldLandWhenPossible && (shouldResnapToNavMesh && squareDistNavMeshCorrection < 3)) {
            newPOV.setPosition(navMeshSnappedPOVPosition);
            this.shouldLandWhenPossible = false;
            this.fly = false;
          }
        }
      }

      // ------------------------------------------CUSTOM------------------------------------
      const avatarRig = document.querySelector("#avatar-rig");
      // Check if controller is put on desk correctly
      if (
        Math.abs(avatarRig.querySelector("#player-left-controller").object3D.rotation.z) > 3 &&
        avatarRig.querySelector("#player-left-controller").object3D.rotation.x < 0
      ) {
        this.controllerDeskCounter += 1;
      } else {
        this.controllerDeskCounter = 0;
        this.deskTrackController = false;
      }

      // Get the floaty objects
      const floaty_objects = AFRAME.scenes[0].querySelectorAll("[floaty-object]");
      // Initiate the list of interactable desks
      const interactable_desks = [];
      // Extract the interactable desks from the list of floaty objects
      for (let floaty_obj of floaty_objects) {
        if (
          floaty_obj.components["media-loader"] != null &&
          floaty_obj.components["media-loader"].data.objectType != null
        ) {
          if (floaty_obj.components["media-loader"].data.objectType == "Interactive_Desk") {
            if (floaty_obj.invisible_desk == null) {
              const scene_objects = AFRAME.scenes[0].querySelectorAll("[class]");
              for (let e of scene_objects) {
                if (e.object3D != null) {
                  if (e.object3D.name == floaty_obj.components["media-loader"].data.invisibleDeskName) {
                    floaty_obj.invisible_desk = e;
                  }
                }
              }
            }
            interactable_desks.push(floaty_obj);
          }
        }
      }
      let closestDesk = null;
      if (this.controllerDeskCounter > 200 || this.deskTrackController) {
        this.controllerDeskCounter = 0;
        // Get avatar position
        const avatarPos = avatarRig.object3D.getWorldPosition();
        // Get the closest desk

        closestDesk = this.getClosestDesk(avatarPos, interactable_desks);
        // Get the position of the left avatar controller

        let avatarLeftControllerPos = Object.assign(
          {},
          avatarRig.querySelector("#player-left-controller").object3D.getWorldPosition()
        );
        avatarLeftControllerPos.y += 0.08;
        // Only raise desk if user is close enough
        if (this.distanceToDesk(avatarPos, closestDesk.object3D) < 2) {
          // Set tracking flag
          this.deskTrackController = true;
          // Desk should not go above 1.402m in height
          if (avatarLeftControllerPos.y < 1.402 && avatarLeftControllerPos.y > 0.905) {
            // Check if one has the ownership of the desk
            const mine = NAF.utils.isMine(closestDesk);
            // If one doesn't have ownership, take ownership
            // This since one can't move the any object without having ownership of it
            if (!mine) {
              NAF.utils.takeOwnership(closestDesk);
            }
            let difference = avatarLeftControllerPos.y - closestDesk.object3D.getWorldPosition().y;

            while (Math.abs(difference) > 0.001) {
              //Change the height of the desk until aligned with controller
              this.raiseDesk(closestDesk, 0.0007 * Math.sign(difference));

              difference = avatarLeftControllerPos.y - closestDesk.object3D.getWorldPosition().y;
            }
          }
        }
      }

      // If user wants to raise desk
      if (userinput.get("/actions/raiseNearestDesk")) {
        // Get avatar position
        const avatarPos = this.avatarRig.object3D.getWorldPosition();
        // Get the closest desk
        closestDesk = this.getClosestDesk(avatarPos, interactable_desks);

        // Only raise desk if user is close enough
        if (this.distanceToDesk(avatarPos, closestDesk.object3D) < 1) {
          // Desk should not go above 1.402m in height
          if (closestDesk.object3D.getWorldPosition().y < 1.402) {
            // Check if one has the ownership of the desk
            const mine = NAF.utils.isMine(closestDesk);
            // If one doesn't have ownership, take ownership
            // This since one can't move the any object without having ownership of it
            if (!mine) {
              NAF.utils.takeOwnership(closestDesk);
            }
            //Raise interactable desk and the collidable invisible desk
            this.raiseDesk(closestDesk, 0.0007);
          }
        }
      }
      // If user wants to lower desk
      else if (userinput.get("/actions/lowerNearestDesk")) {
        // Get avatar position
        const avatarPos = this.avatarRig.object3D.getWorldPosition();
        // Get the closest desk
        closestDesk = this.getClosestDesk(avatarPos, interactable_desks);
        // Only lower desk if user is close enough
        if (this.distanceToDesk(avatarPos, closestDesk.object3D) < 1) {
          // Desk should not go below 0.905m in height
          if (closestDesk.object3D.getWorldPosition().y > 0.905) {
            // Check if one has the ownership of the desk
            const mine = NAF.utils.isMine(closestDesk);
            // If one doesn't have ownership, take ownership
            // This since one can't move the any object without having ownership of it
            if (!mine) {
              NAF.utils.takeOwnership(closestDesk);
            }
            //Lower interactable desk and the collidable invisible desk
            this.raiseDesk(closestDesk, -0.0007);
          }
        }
      }

      let floaty_objs = document.querySelectorAll("[floaty-object]");

      floaty_objs.forEach(floaty_obj => {
        if (floaty_obj.object3D != null) {
          if (floaty_obj.components["media-loader"] != null) {
            if (
              floaty_obj.components["media-loader"].data.objectType == "Interactive_Desk" ||
              floaty_obj.components["media-loader"].data.objectType == "SnapObject"
            ) {
              floaty_obj.removeAttribute("draggable");
              floaty_obj.removeAttribute("hoverable-visuals");
              floaty_obj.removeAttribute("is-remote-hover-target");
            }
          }
        }
      });
      //---------------------------------------------------------------------------------------
      childMatch(this.avatarRig.object3D, this.avatarPOV.object3D, newPOV);
      this.relativeMotion.copy(this.nextRelativeMotion);
      this.dXZ = 0;
    };
  })();

  getClosestNode(pos) {
    const pathfinder = this.scene.systems.nav.pathfinder;
    if (!pathfinder.zones[NAV_ZONE].groups[this.navGroup]) {
      return null;
    }
    return (
      pathfinder.getClosestNode(pos, NAV_ZONE, this.navGroup, true) ||
      pathfinder.getClosestNode(pos, NAV_ZONE, this.navGroup)
    );
  }

  findPOVPositionAboveNavMesh = (function() {
    const startingFeetPosition = new THREE.Vector3();
    const desiredFeetPosition = new THREE.Vector3();
    // TODO: Here we assume the player is standing straight up, but in VR it is often the case
    // that you want to lean over the edge of a balcony/table that does not have nav mesh below.
    // We should find way to allow leaning over the edge of a balcony and maybe disallow putting
    // your head through a wall.
    return function findPOVPositionAboveNavMesh(
      startPOVPosition,
      desiredPOVPosition,
      outPOVPosition,
      shouldRecomputeGroupAndNode
    ) {
      const playerHeight = getCurrentPlayerHeight(true);
      startingFeetPosition.copy(startPOVPosition);
      startingFeetPosition.y -= playerHeight;
      desiredFeetPosition.copy(desiredPOVPosition);
      desiredFeetPosition.y -= playerHeight;
      this.findPositionOnNavMesh(
        startingFeetPosition,
        desiredFeetPosition,
        outPOVPosition,
        shouldRecomputeGroupAndNode
      );
      outPOVPosition.y += playerHeight;
      return outPOVPosition;
    };
  })();

  findPositionOnNavMesh(start, end, outPos, shouldRecomputeGroupAndNode) {
    const pathfinder = this.scene.systems.nav.pathfinder;
    if (!(NAV_ZONE in pathfinder.zones)) return;
    this.navGroup =
      shouldRecomputeGroupAndNode || this.navGroup === null
        ? pathfinder.getGroup(NAV_ZONE, end, true, true)
        : this.navGroup;
    this.navNode =
      shouldRecomputeGroupAndNode || this.navNode === null || this.navNode === undefined
        ? this.getClosestNode(end)
        : this.navNode;
    if (this.navNode === null || this.navNode === undefined) {
      // this.navNode can be null if it has never been set or if getClosestNode fails,
      // and it can be undefined if clampStep fails, so we have to check both. We do not
      // simply check if it is falsey (!this.navNode), because 0 (zero) is a valid value,
      // and 0 is falsey.
      outPos.copy(end);
    } else {
      this.navNode = pathfinder.clampStep(start, end, this.navNode, NAV_ZONE, this.navGroup, outPos);
    }
    return outPos;
  }

  enableFly(enabled) {
    if (enabled && window.APP.hubChannel && window.APP.hubChannel.can("fly")) {
      this.fly = true;
    } else {
      this.fly = false;
    }
    return this.fly;
  }
}
