import nextTick from "./utils/next-tick";

export class AdjustableDeskSpawner {
  constructor() {
    this.init();
  }
  init = () => {
    this.deskURLs = {
      b5: "https://uploads-prod.reticulum.io/files/ae0a49d5-4fa5-4087-a572-a104c470a320.glb",
      "eow-c": "https://uploads-prod.reticulum.io/files/bc45839f-eb4b-4ff4-967f-04f33262ba79.glb"
    };
  };
  //"https://uploads-prod.reticulum.io/files/09a3d5f6-8e7d-4cd3-b243-76bcc391a710.glb"
  loadAssetFromURL = (url, position) => {
    const el = document.createElement("a-entity");
    AFRAME.scenes[0].appendChild(el);
    el.setAttribute("media-loader", { src: url, fitToBox: false, resolve: true });
    el.setAttribute("networked", { template: "#interactable-media" });
    el.setAttribute("position", position);
    return el;
  };

  spawnDesks = () => {
    // Spawn the desk and position it
    const g = AFRAME.scenes[0].querySelectorAll("[class]");
    const deskGroups = [];
    for (const e of g) {
      if (e.className.substring(0, 10) == "Desk_Group") {
        deskGroups.push(e);
      }
    }
    const desks = [];
    const targets = [];
    for (const deskGroup of deskGroups) {
      for (const deskGroupChild of deskGroup.object3D.children) {
        // Find the invisible desks to link with
        if (deskGroupChild.name.substring(0, 14) == "Invisible_Desk") {
          const deskType = deskGroupChild.name.substring(15, deskGroupChild.name.length - 2);
          const newDeskPosition = Object.assign({}, deskGroupChild.el.object3D.getWorldPosition());
          // Load desk at correct position
          const newDesk = this.loadAssetFromURL(this.deskURLs[deskType.toLowerCase()], newDeskPosition);
          targets.push(deskGroupChild);
          newDesk.updateComponent("media-loader", { deskType: deskType });
          newDesk.updateComponent("media-loader", { invisibleDeskName: deskGroupChild.name });
          newDesk.updateComponent("media-loader", { objectType: "Interactive_Desk" });
          desks.push(newDesk);
        }
      }
    }
    for (let i = 0; i < desks.length; i++) {
      // Set rotation for desks
      desks[i].object3D.setRotationFromQuaternion(targets[i].el.object3D.getWorldQuaternion());
      desks[i].object3D.name = "Interactive_Desk_".concat(i);
      desks[i].currentHeightOffset = 0;
      desks[i].updateComponent("media-loader", { deskName: desks[i].object3D.name });
    }
    return desks;
  };
  degreeToRadians = degrees => {
    return (degrees * Math.PI) / 180;
  };
  getScreenOffsetsForDesk(deskType) {
    if (deskType.toLowerCase() === "b5") {
      return [
        { posX: -1.135, posY: 0.574, posZ: -0.222, rotX: 0, rotY: this.degreeToRadians(17.5), rotZ: 0 },
        {
          posX: -1.125,
          posY: 0.21,
          posZ: -0.185,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(17.5),
          rotZ: this.degreeToRadians(0)
        },
        { posX: -0.572, posY: 0.574, posZ: -0.354, rotX: 0, rotY: this.degreeToRadians(8.7), rotZ: 0 },
        {
          posX: -0.572,
          posY: 0.21,
          posZ: -0.313,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(8.5),
          rotZ: this.degreeToRadians(0)
        },
        { posX: 0, posY: 0.574, posZ: -0.391, rotX: 0, rotY: 0, rotZ: 0 },
        { posX: 0, posY: 0.21, posZ: -0.355, rotX: this.degreeToRadians(-13), rotY: 0, rotZ: 0 },

        { posX: 0.575, posY: 0.574, posZ: -0.355, rotX: 0, rotY: this.degreeToRadians(-8.7), rotZ: 0 },
        {
          posX: 0.575,
          posY: 0.21,
          posZ: -0.31,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(-8.7),
          rotZ: 0
        },
        { posX: 1.14, posY: 0.574, posZ: -0.22, rotX: 0, rotY: this.degreeToRadians(-17.4), rotZ: 0 },
        {
          posX: 1.128,
          posY: 0.21,
          posZ: -0.18,
          rotX: this.degreeToRadians(-13.5),
          rotY: this.degreeToRadians(-17.4),
          rotZ: 0
        }
      ];
    } else if (deskType.toLowerCase() == "eow-c") {
      return [
        { posX: -0.625, posY: 0.7, posZ: -0.635, rotX: 0, rotY: this.degreeToRadians(6.3), rotZ: 0 },
        {
          posX: 0.465,
          posY: 0.7,
          posZ: -0.635,
          rotX: 0,
          rotY: this.degreeToRadians(-6.3),
          rotZ: 0
        },
        {
          posX: -0.935,
          posY: 0.18,
          posZ: -0.3,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(12.5),
          rotZ: 0
        },
        {
          posX: -0.366,
          posY: 0.18,
          posZ: -0.39,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(4),
          rotZ: 0
        },
        {
          posX: 0.206,
          posY: 0.18,
          posZ: -0.39,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(-4),
          rotZ: 0
        },
        {
          posX: 0.767,
          posY: 0.18,
          posZ: -0.3,
          rotX: this.degreeToRadians(-13),
          rotY: this.degreeToRadians(-12.5),
          rotZ: 0
        }
      ];
    }
    return null;
  }
  getScreenScalesForDesk(deskType) {
    if (deskType.toLowerCase() === "b5") {
      return { x: 0.55, y: 0.58, z: 0.7 };
    } else if (deskType.toLowerCase() === "eow-c") {
      return [{ x: 1.08, y: 1.08, z: 1 }, { x: 0.55, y: 0.58, z: 0.7 }];
    }
    return null;
  }

  spawnSnapScreens = async desk => {
    const Eow_cImageURLs = [
      "https://uploads-prod.reticulum.io/files/08aef25d-8938-4ae3-b423-2ef842a848fa.png",
      "https://uploads-prod.reticulum.io/files/8b5e4d89-a7d6-43d7-af89-8347630196cd.png",
      "https://uploads-prod.reticulum.io/files/dffdc170-2336-41ac-ab2c-876d6ffc227f.png",
      "https://uploads-prod.reticulum.io/files/b90815c5-838e-4eac-9aed-fdd07891681c.png",
      "https://uploads-prod.reticulum.io/files/b2be34b4-4287-4efa-8225-be0af3036eec.png",
      "https://uploads-prod.reticulum.io/files/79921f6c-28e3-43e6-a235-4af7d115687d.png"
    ];
    const tempURL = "https://uploads-prod.reticulum.io/files/f1e8b354-6c4d-4b3a-b812-31a3571bf58d.png";

    // Get the correct position offset and scale of the snap objects for the current desk
    const snapObjectOffsets = this.getScreenOffsetsForDesk(desk.components["media-loader"].data.deskType);
    const snapObjectScales = this.getScreenScalesForDesk(desk.components["media-loader"].data.deskType);
    // If unknown desk name, don't continue
    if (snapObjectOffsets != null) {
      const deskPosition = Object.assign({}, desk.object3D.getWorldPosition());

      snapObjectOffsets.forEach(snapOffset => {
        let snapObject;
        //Check if desk is of type eow-c or b6
        if (desk.components["media-loader"].data.deskType.toLowerCase() != "eow-c") {
          snapObject = this.loadAssetFromURL(tempURL, deskPosition);
        } else {
          snapObject = this.loadAssetFromURL(Eow_cImageURLs[snapObjectOffsets.indexOf(snapOffset)], deskPosition);
        }

        (async () => {
          while (snapObject.hasLoaded === false) {
            await nextTick();
          }
          if (snapObject.hasLoaded) {
            snapObject.object3D.setRotationFromQuaternion(desk.object3D.getWorldQuaternion());

            if (desk.components["media-loader"].data.deskType.toLowerCase() != "eow-c") {
              // Set correct scale for snap object
              snapObject.object3D.scale.x = snapObjectScales.x;
              snapObject.object3D.scale.y = snapObjectScales.y;
              snapObject.object3D.scale.z = snapObjectScales.z;
            } else {
              // Since EOW-c has both big and small monitors
              if (snapOffset.posY > 0.6) {
                // Set correct scale for snap object

                snapObject.object3D.scale.x = snapObjectScales[0].x;
                snapObject.object3D.scale.y = snapObjectScales[0].y;
                snapObject.object3D.scale.z = snapObjectScales[0].z;
              } else {
                snapObject.object3D.scale.x = snapObjectScales[1].x;
                snapObject.object3D.scale.y = snapObjectScales[1].y;
                snapObject.object3D.scale.z = snapObjectScales[1].z;
              }
            }

            // Move snap object to correct position offset
            snapObject.object3D.translateX(snapOffset.posX);
            snapObject.object3D.translateY(snapOffset.posY - 0.17);
            snapObject.object3D.translateZ(snapOffset.posZ);
            // Rotate snap object
            snapObject.object3D.rotation.x += snapOffset.rotX;
            snapObject.object3D.rotation.y += snapOffset.rotY;
            snapObject.object3D.rotation.z += snapOffset.rotZ;
            snapObject.object3D.translateZ(0.01);
            // Make snap object not moveable by mouse/oculus controller
            snapObject.removeAttribute("draggable");
            snapObject.removeAttribute("hoverable-visuals");
            snapObject.removeAttribute("is-remote-hover-target");
            // Assign name, desk and the current offset in Y axis
            snapObject.updateComponent("media-loader", { objectType: "SnapObject" });
            snapObject.object3D.name = "SnapObject";
            snapObject.isSnapObject = true;
            snapObject.updateComponent("media-loader", { deskName: desk.components["media-loader"].data.deskName });
            snapObject.desk = desk;
            snapObject.deskOffsetY = Math.fround(snapOffset.posY - 0.17);
            snapObject.updateComponent("body-helper", { collisionFilterMask: 1 });
          }
        })();
      });
    }
  };
  getEuclideanDistOfX_Z = (object1, object2) => {
    const x_distance = object1.x - object2.x;
    const z_distance = object1.z - object2.z;
    return Math.sqrt(x_distance * x_distance + z_distance * z_distance);
  };
  spawnOrFindDesks = async () => {
    const floaty_objects = AFRAME.scenes[0].querySelectorAll("[floaty-object]");

    const scene_objects = AFRAME.scenes[0].querySelectorAll("[class]");
    const invisible_desks = [];
    let desksAlreadySpawned = false;
    // Get the invisible desks of the scene
    for (const e of scene_objects) {
      if (e.object3D != null) {
        if (e.object3D.name.substring(0, 14) == "Invisible_Desk") {
          invisible_desks.push(e);
        }
      }
    }
    // Determine if interactive desks already are spawned
    const interactive_desks = [];
    for (const floaty_object of floaty_objects) {
      if (floaty_object.components["media-loader"] != null) {
        if (floaty_object.components["media-loader"].data.objectType == "Interactive_Desk") {
          desksAlreadySpawned = true;
          // If desks are spawned, find the corresponding invisible desk and link them together
          for (const inv_desk of invisible_desks) {
            if (inv_desk.object3D.name == floaty_object.components["media-loader"].data.invisibleDeskName) {
              floaty_object.invisible_desk = inv_desk;
              floaty_object.object3D.name = "Interactive_Desk".concat(
                inv_desk.object3D.name.substring(14, inv_desk.object3D.name.length)
              );
            }
          }
          // Make desk not draggable
          floaty_object.removeAttribute("draggable");
          floaty_object.removeAttribute("hoverable-visuals");
          floaty_object.removeAttribute("is-remote-hover-target");
          floaty_object.updateComponent("tags", { isHoldable: false });
          interactive_desks.push(floaty_object);
        }
      }
    }

    if (desksAlreadySpawned) {
      // Find the snap objects
      for (const floaty_object of floaty_objects) {
        if (floaty_object.object3D != null) {
          if (floaty_object.components["media-loader"].data.objectType == "SnapObject") {
            // Give correct object3D name and make not draggable
            floaty_object.object3D.name = "SnapObject";
            floaty_object.removeAttribute("draggable");
            floaty_object.removeAttribute("hoverable-visuals");
            floaty_object.removeAttribute("is-remote-hover-target");

            // Find the corresponding interactive desk of the snap object
            for (const desk of interactive_desks) {
              if (
                desk.components["media-loader"].data.deskName == floaty_object.components["media-loader"].data.deskName
              ) {
                // Link together the snap object and interactive desk
                floaty_object.desk = desk;
              }
            }
            floaty_object.deskOffsetY =
              floaty_object.object3D.getWorldPosition().y - floaty_object.desk.object3D.getWorldPosition().y;
          }
        }
      }
    }

    if (!desksAlreadySpawned) {
      // Spawn the interactive desks
      const spawnedDesks = this.spawnDesks();
      spawnedDesks.forEach(desk => {
        (async () => {
          while (desk.hasLoaded === false) {
            await nextTick();
          }
          // Make desks not draggable
          desk.removeAttribute("draggable");
          desk.removeAttribute("hoverable-visuals");
          desk.removeAttribute("is-remote-hover-target");
          desk.updateComponent("tags", { isHoldable: false });
          // move slightly because of offset in desk shape
          desk.object3D.translateZ(-0.01);
          desk.object3D.translateY(0.17);
          // link together the interactive desk and invisible desk
          desk.invisible_desk = invisible_desks[spawnedDesks.indexOf(desk)];
          desk.YAxisOffset = 0;
          // If of model EOW-c, hubs centers the object incorrectly so a slight offset has to be done
          if (desk.components["media-loader"].data.deskType.toLowerCase() == "eow-c") {
            desk.object3D.translateX(0.08);
            desk.object3D.translateZ(0.21);
          }

          desk.updateComponent("body-helper", { collisionFilterMask: 0 });
          desk.updateComponent("body-helper", { disableCollision: true });
          desk.updateComponent("body-helper", { collisionFilterGroup: 0 });
          this.spawnSnapScreens(desk);
        })();
      });
    }
  };
}
