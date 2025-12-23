/**
 * Custom Dimension Portals using Custom Portal API
 *
 * Registers custom portals for Nether (Steel Block frame) and End (Black Steel Block frame).
 * Includes Create mod train integration via PortalTrackProvider.
 *
 * Requires: cpapireforged mod with ITeleporter fix for proper End teleportation.
 */

StartupEvents.postInit(event => {
    console.log("[CustomPortal] Registering custom dimension portals... (v35)")

    let CustomPortalApiRegistry = Java.loadClass("net.kyrptonaught.customportalapi.CustomPortalApiRegistry")
    let PortalLink = Java.loadClass("net.kyrptonaught.customportalapi.util.PortalLink")
    let ColorUtil = Java.loadClass("net.kyrptonaught.customportalapi.util.ColorUtil")
    let ResourceLocation = Java.loadClass("net.minecraft.resources.ResourceLocation")
    let ForgeRegistries = Java.loadClass("net.minecraftforge.registries.ForgeRegistries")
    let PortalTrackProvider = Java.loadClass("com.simibubi.create.api.contraption.train.PortalTrackProvider")
    let BlockFace = Java.loadClass("net.createmod.catnip.math.BlockFace")
    let Registries = Java.loadClass("net.minecraft.core.registries.Registries")
    let ResourceKey = Java.loadClass("net.minecraft.resources.ResourceKey")
    let BlockPos = Java.loadClass("net.minecraft.core.BlockPos")

    let getBlock = (modid, name) => ForgeRegistries.BLOCKS.getValue(new ResourceLocation(modid, name))

    // === NETHER PORTAL ===
    let steelBlock = getBlock("gtceu", "steel_block")
    let netherDim = new ResourceLocation("minecraft", "the_nether")
    let overworldDim = new ResourceLocation("minecraft", "overworld")

    if (steelBlock) {
        let netherLink = new PortalLink()
        netherLink.block = new ResourceLocation("gtceu", "steel_block")
        netherLink.dimID = netherDim
        netherLink.returnDimID = overworldDim
        netherLink.colorID = ColorUtil.getColorFromRGB(131, 66, 184)
        netherLink.portalSearchYBottom = 5
        netherLink.portalSearchYTop = 120
        netherLink.returnPortalSearchYBottom = -60
        netherLink.returnPortalSearchYTop = 300

        CustomPortalApiRegistry.addPortal(steelBlock, netherLink)
        console.log("[CustomPortal] Nether portal registered!")
    }

    // === END PORTAL ===
    let blackSteelBlock = getBlock("gtceu", "black_steel_block")
    let endDim = new ResourceLocation("minecraft", "the_end")

    if (blackSteelBlock) {
        let endLink = new PortalLink()
        endLink.block = new ResourceLocation("gtceu", "black_steel_block")
        endLink.dimID = endDim
        endLink.returnDimID = overworldDim
        endLink.colorID = ColorUtil.getColorFromRGB(45, 65, 101)
        // Use same Y range as Nether portal for consistency
        endLink.portalSearchYBottom = 5
        endLink.portalSearchYTop = 120
        endLink.returnPortalSearchYBottom = -60
        endLink.returnPortalSearchYTop = 300

        CustomPortalApiRegistry.addPortal(blackSteelBlock, endLink)
        console.log("[CustomPortal] End portal registered!")
    }

    // === CREATE TRAIN INTEGRATION ===
    let customPortalBlock = getBlock("cpapireforged", "custom_portal_block")
    console.log("[CustomPortal] Custom Portal Block: " + customPortalBlock)

    if (customPortalBlock) {
        try {
            let CustomPortalsMod = Java.loadClass("net.kyrptonaught.customportalapi.CustomPortalsMod")
            let CustomPortalHelper = Java.loadClass("net.kyrptonaught.customportalapi.util.CustomPortalHelper")
            let BlockPos = Java.loadClass("net.minecraft.core.BlockPos")
            let Direction = Java.loadClass("net.minecraft.core.Direction")
            let ServerLevel = Java.loadClass("net.minecraft.server.level.ServerLevel")
            let ExitClass = Java.loadClass("com.simibubi.create.api.contraption.train.PortalTrackProvider$Exit")
            let Level = Java.loadClass("net.minecraft.world.level.Level")

            let provider = new JavaAdapter(PortalTrackProvider, {
                findExit: function(level, inboundTrack) {
                    try {
                        console.log("[CustomPortal] findExit called!")

                        // Get the portal block position (adjacent to the track)
                        let trackConnectedPos = inboundTrack.getConnectedPos()
                        console.log("[CustomPortal]   Track connected pos: " + trackConnectedPos)

                        // Get portal linking storage from Custom Portal API
                        let portalLinkingStorage = CustomPortalsMod.portalLinkingStorage
                        console.log("[CustomPortal]   Portal linking storage: " + portalLinkingStorage)

                        if (portalLinkingStorage == null) {
                            console.log("[CustomPortal]   No portal linking storage!")
                            return null
                        }

                        // Get the current dimension - Rhino converts ResourceKey to ResourceLocation
                        // so we need to explicitly create a ResourceKey<Level>
                        let currentDimRL = level["dimension"]
                        console.log("[CustomPortal]   Current dimension RL: " + currentDimRL)

                        // Create proper ResourceKey<Level> from the ResourceLocation
                        let currentDimKey = ResourceKey.create(Registries.DIMENSION, currentDimRL)
                        console.log("[CustomPortal]   Current dimension key: " + currentDimKey)

                        // Search nearby positions for a stored portal link
                        // The portal block position may not be exactly at trackConnectedPos
                        let destination = null
                        let foundPortalPos = null
                        let searchRadius = 5

                        outer:
                        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
                            for (let dy = -searchRadius; dy <= searchRadius; dy++) {
                                for (let dz = -searchRadius; dz <= searchRadius; dz++) {
                                    let checkPos = new BlockPos(
                                        trackConnectedPos.getX() + dx,
                                        trackConnectedPos.getY() + dy,
                                        trackConnectedPos.getZ() + dz
                                    )
                                    let checkDest = portalLinkingStorage.getDestination(checkPos, currentDimKey)
                                    if (checkDest != null) {
                                        destination = checkDest
                                        foundPortalPos = checkPos
                                        console.log("[CustomPortal]   Found link at: " + checkPos)
                                        break outer
                                    }
                                }
                            }
                        }

                        console.log("[CustomPortal]   Destination: " + destination)

                        if (destination == null) {
                            console.log("[CustomPortal]   No linked destination found!")
                            return null
                        }

                        // Get target level from destination
                        let targetDimRL = destination.dimensionType
                        let targetPos = destination.pos
                        console.log("[CustomPortal]   Target dim: " + targetDimRL)
                        console.log("[CustomPortal]   Target pos: " + targetPos)

                        // Use KubeJS helper: server.getLevel(ResourceLocation) - this avoids the ambiguous getLevel(ResourceKey) issue
                        let server = level.getServer()
                        let targetLevel = server.getLevel(targetDimRL)

                        console.log("[CustomPortal]   Target level: " + targetLevel)

                        if (targetLevel == null) {
                            console.log("[CustomPortal]   Target level not found!")
                            return null
                        }

                        // For trains, use the exact portal destination position
                        // (findSafeLandingPos is only for entities that need ground to stand on)
                        // The portal linking system already stored the correct destination portal position
                        console.log("[CustomPortal]   Using target pos directly: " + targetPos)

                        // Find track exit position
                        let entryDir = inboundTrack.getFace()
                        let exitDir = entryDir
                        let exitPos = targetPos.relative(exitDir)

                        console.log("[CustomPortal]   Entry dir: " + entryDir)
                        console.log("[CustomPortal]   Exit pos: " + exitPos)

                        // Create the Exit record - use 'new' directly for Java records
                        let exitFace = new BlockFace(exitPos, exitDir.getOpposite())
                        let exit = new ExitClass(targetLevel, exitFace)

                        console.log("[CustomPortal]   Returning exit: " + exit)
                        return exit

                    } catch (e) {
                        console.log("[CustomPortal] Error in findExit: " + e)
                        console.log("[CustomPortal] Stack: " + e.stack)
                        return null
                    }
                }
            })

            PortalTrackProvider.REGISTRY.register(customPortalBlock, provider)
            console.log("[CustomPortal] Create train provider registered with JavaAdapter!")
        } catch (e) {
            console.log("[CustomPortal] Create train integration failed: " + e)
        }
    }

    console.log("[CustomPortal] Done!")
})
