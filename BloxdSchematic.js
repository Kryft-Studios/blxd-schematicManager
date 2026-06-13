import avsc from "avsc"
import voxelCrunch from "voxel-crunch"

/**@typedef {number[]&{length:3}} Vec3*/
/**@typedef {{pos:Vec3, blocks: string[]}} ChunkDescriptor */
/**@typedef {{pos:Vec3, data: Record<any,any>}} BlockDataDescriptor */
/**
 * @typedef {{
 * name: string,
 * copyOffset: Vec3,
 * pasteOffset:Vec3,
 * lobbyCode:string,
 * size: Vec3,
 * chunks: ChunkDescriptor[],
 * blockDatas: BlockDataDescriptor[],
 * owner: string
 * }} SchematicDescriptor
 */
class SchematicManager {
    static #_parseBlockNameType(blockText) {
        const blockNames = [];
        const blockNameSet = new Set();

        function addBlockName(blockName) {
            if (blockNameSet.has(blockName)) return;
            blockNameSet.add(blockName);
            blockNames.push(blockName);
        }

        const woodTypes = ["Maple", "Pine", "Plum", "Cedar", "Aspen", "Jungle"];

        for (const line of blockText.split("\n")) {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith("#")) {
                continue;
            }

            const match = trimmed.match(/^(.*?)\s*(?:\[([^\]]+)\])?$/);
            if (!match) continue;

            const blockName = match[1].trim();
            const meta = match[2]?.split(",").map(x => x.trim()) ?? [];

            addBlockName(blockName);

            for (const code of meta) {
                switch (code) {
                    case "G":
                        addBlockName(`${blockName}|Growing`);
                        break;
                    case "FG":
                        addBlockName(`${blockName}|FreshlyGrown`);
                        break;
                    case "RT":
                        addBlockName(`${blockName}|Roots`);
                        break;
                    case "LV":
                        addBlockName(`${blockName}|Lava`);
                        break;
                    case "TP":
                        addBlockName(`${blockName}|Top`);
                        break;
                    case "GR":
                        addBlockName(`${blockName}|GrassRoots`);
                        break;
                    case "BK":
                        addBlockName(`${blockName}|Breaking`);
                        break;
                    case "FL":
                        addBlockName(`${blockName}|Flashing`);
                        break;
                    case "TC":
                        addBlockName(`${blockName}|TreeCanopy`);
                        break;
                    case "TB":
                        for (const wt of woodTypes) {
                            addBlockName(`${blockName}|TreeBase|${wt}`);
                        }
                        break;
                    case "R":
                        for (const rot of [1, 2, 3, 4]) {
                            addBlockName(`${blockName}|meta|rot${rot}`);
                        }
                        break;
                    case "O":
                        for (const rot of [1, 2, 3, 4]) {
                            addBlockName(`${blockName}|meta|rot${rot}|open`);
                            addBlockName(`${blockName}|meta|rot${rot}|closed`);
                        }
                        break;
                    case "H":
                        for (const rot of [1, 2, 3, 4]) {
                            addBlockName(`${blockName}|meta|rot${rot}|top`);
                            addBlockName(`${blockName}|meta|rot${rot}|bot`);
                            addBlockName(`${blockName}|meta|rot${rot}|side`);
                        }
                        break;
                    case "B":
                        for (const rot of [1, 2, 3, 4]) {
                            for (const book of [1, 2, 3, 4, 5, 6]) {
                                addBlockName(`${blockName}|meta|rot${rot}|books${book}`);
                            }
                        }
                        break;
                }
            }
        }

        return blockNames;
    }
    static blocknames = []
    static async initAsync() {
        const text = await (await fetch("https://raw.githubusercontent.com/Bloxdy/code-api/refs/heads/main/BLOCK_NAMES.txt")).text();
        this.blocknames = this.#_parseBlockNameType(text);
    }
    static schema = avsc.Type.forSchema({
        type: "record",
        name: "Schematic",
        fields: [
            /**This is the version header. */
            { name: 'headers', type: { type: 'fixed', size: 4 }, default: "\u{4}\u{0}\u{0}\u{0}" },

            /** Name of the bloxdschem */
            { name: "name", type: "string" },

            /**starting xyz */
            { name: "x", type: "int" },
            { name: "y", type: "int" },
            { name: "z", type: "int" },

            /**Size of the schem */
            { name: "sizeX", type: "int" },
            { name: "sizeY", type: "int" },
            { name: "sizeZ", type: "int" },

            /**Chunks*/
            {
                name: "chunks",
                type: {
                    type: "array",
                    items: {
                        type: "record",
                        name: "ChunkData",
                        fields: [
                            { name: "x", type: "int" },
                            { name: "y", type: "int" },
                            { name: "z", type: "int" },
                            { name: "blocks", type: "bytes" }
                        ]
                    }
                }
            },

            /**Block datas in str*/
            {
                name: "blockdatas",
                type: {
                    type: "array",
                    items: {
                        type: "record",
                        name: "TileEntityData",
                        fields: [
                            { name: "blockX", type: "int" },
                            { name: "blockY", type: "int" },
                            { name: "blockZ", type: "int" },
                            { name: "blockdataStr", type: "string" } // Raw string injection block parameters
                        ]
                    }
                },
                default: []
            },

            /**paste offset */
            { name: "globalX", type: "int", default: 0 },
            { name: "globalY", type: "int", default: 0 },
            { name: "globalZ", type: "int", default: 0 },

            /**The lobby code */
            { name: "lobbyCode", type: ["null", "string"], default: null },

            /**The owner's db id */
            { name: "owner", type: "string" },

            /**Random stuff i found in schema i found from bloxd's source code */
            { name: "disjoint", type: "boolean", default: false },
            { name: 'wtvthisis', type: { type: 'fixed', size: 3 }, default: "\u{0}\u{0}\u{0}" },
        ]
    })
    /**@param {Buffer} buffer @returns {SchematicDescriptor}*/
    static readBuffer(
        buffer
    ) {
        const schem = {};
        let read;
        try {
            read = this.schema.fromBuffer(buffer, undefined, true);
        } catch (e) { throw new Error("Failed to read") }
        schem.name = read.name;
        schem.copyOffset = [read.x, read.y, read.z];
        schem.pasteOffset = [read.globalX, read.globalY, read.globalZ];
        schem.lobbyCode = read.lobbyCode;
        schem.size = [read.sizeX, read.sizeY, read.sizeZ];
        schem.chunks = []
        for (const chunk of read.chunks) {
            const chunkdesc = { pos: [chunk.x, chunk.y, chunk.z] }
            chunkdesc.blocks = voxelCrunch.decode(1, chunk.blocks).map(a => this.blocknames[a]);
            schem.chunks.push(chunkdesc);
        }
        schem.blockDatas = [];
        for (const bd of read.blockdatas) {
            const bddesc = { pos: [bd.blockX, bd.blockY, bd.blockZ] }
            bddesc.data = JSON.parse(bd.blockdataStr);
            schem.blockDatas.push(bddesc)
        }
        schem.owner = read.owner
        return schem
    };
    static HEADER = Buffer.from([0x04, 0, 0, 0])
    static FOOTER = Buffer.from([0, 0, 0])
    /**@param {SchematicDescriptor}schemdesc */
    static getBuffer(schemdesc) {
        return this.schema.toBuffer({
            headers: this.HEADER,
            name: schemdesc.name,
            x: schemdesc.copyOffset[0],
            y: schemdesc.copyOffset[1],
            z: schemdesc.copyOffset[2],
            sizeX: schemdesc.size[0],
            sizeY: schemdesc.size[1],
            sizeZ: schemdesc.size[2],
            globalX: schemdesc.pasteOffset[0],
            globalY: schemdesc.pasteOffset[1],
            globalZ: schemdesc.pasteOffset[2],
            chunks: schemdesc.chunks.map(a => {
                const uncompressedIds = a.blocks.map(name => this.blocknames.indexOf(name));
                const compressedBytes = voxelCrunch.encode(uncompressedIds);
                return {
                    x: a.pos[0],
                    y: a.pos[1],
                    z: a.pos[2],
                    blocks: Buffer.from(compressedBytes)
                }
            }),
            blockdatas: schemdesc.blockDatas.map(a => {
                return {
                    blockX: a.pos[0],
                    blockY: a.pos[1],
                    blockZ: a.pos[2],
                    blockdataStr: JSON.stringify(a.data)
                }
            }),
            lobbyCode: schemdesc.lobbyCode,
            owner: schemdesc.owner,
            disjoint: false,
            wtvthisis: this.FOOTER
        })
    }
};