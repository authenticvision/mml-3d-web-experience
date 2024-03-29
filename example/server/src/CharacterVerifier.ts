import { Request } from 'express';
import { JSDOM } from 'jsdom';
import crypto from 'crypto'
import { UserAuthenticator } from './auth';


class CharacterInventoryItem {
    public readonly uid: string;
    private owners = new Set<string>();
    private freeForAll: boolean = false;

    constructor(
        private characterController: CharacterController,
        public readonly src: string | null = null,
        public readonly id: string | null = null,
        // Indicates this can only exist in one inventory
        public readonly uniqueItem: boolean = false) {
            // Compute a uid
            if(id) {
                this.uid = id;
            } else if(this.src) {
                this.uid = this.src;
            } else {
                this.uid = crypto.randomBytes(20).toString('hex');
            }
    }


    public transferOwnership(userId: string) {
        if(this.uniqueItem) {
            for(let currentOwner of this.owners.values()) {
                console.log(currentOwner);
                this.removeOwner(currentOwner);
            }
        }
        this.addOwner(userId);
    }


    public addOwner(userId: string) {
        if(this.uniqueItem) {
            if(this.owners.size > 0) {
                throw `Unique item already owned. Cannot add owner ${userId} to inventory item ${this.uid}.`
            }
        }
        // indempotent approach
        if(!this.owners.has(userId)) {
            this.owners.add(userId);
            this.notify(userId);
        }
    }

    public setFreeForAll(value: boolean) {
        this.freeForAll = value;

    }

    public removeOwner(userId: string) {
        if(this.owners.has(userId)) {
            this.owners.delete(userId);
            this.notify(userId);
        }
    }

    public isOwner(userId: string): boolean {
        return this.owners.has(userId) || ((!this.uniqueItem) && this.freeForAll);
    }

    private notify(userId:string) {
        this.characterController.onOwnershipChange(userId, this);
    }

}


// This shall only exist ones and holds all globally available inventory items
class InventoryItems {
    private inventoryByUid = new Map<string, CharacterInventoryItem>();
  
    constructor() {

        
    }

    public addInventoryItem(inventoryItem: CharacterInventoryItem) {
        if(this.inventoryByUid.has(inventoryItem.uid)){ 
            console.warn(`Tried to add existing inventory item uid=${inventoryItem.uid}`);
            return;
        }
        //console.log(`Added inventory item ${inventoryItem.uid}`);
        this.inventoryByUid.set(inventoryItem.uid, inventoryItem);
    }

    public inventoryItemBySrc(src: string): CharacterInventoryItem | undefined {
        return this.inventoryByUid.get(src);
    }

    public canUseSrc(userId: string, src:string ): boolean {

        const inventoryItem = this.inventoryByUid.get(src);

        if(inventoryItem) {
            const isOwner =  inventoryItem.isOwner(userId);
            if(!isOwner) {
                console.error(`user ${userId} is not owner of src=${src}`);
            }
            return isOwner;
        }

        return false;
    }
}


type MyCharacterDescription = {
    mmlCharacterString?: string
}


class CharacterController {
    // Verifies character updates
    // Manages inventory, in particular when there are unique objects, s.t. if they are added to the inventory of one character
    // they are removed from another character's inventory.

    private allItems = new InventoryItems();
    private userAuthenticator: UserAuthenticator;
    private currentCharacters = new Map<string, MyCharacterDescription>;

    constructor() {
        this.defineItems();        
    }

    public getAuthorizedCharacterDescription(userId: string, characterDescription: object): object | null {
        const typedCharacterDescription = characterDescription as MyCharacterDescription;
        const mmlCharacterString = typedCharacterDescription.mmlCharacterString ?? null;
        
        if(mmlCharacterString === null) {
            // If there is no character string, consider it valid
            return characterDescription;
        }

        const dom = new JSDOM(mmlCharacterString!);
        const doc = dom.window.document;

        for(let element of doc.querySelectorAll('*')) {
            const src = element.getAttribute('src');
            if(src) {
                if(!this.allItems.canUseSrc(userId, src!)) {
                    console.warn(`Remove ${src} from character: ${userId} is not a owner`);
                    element.parentNode?.removeChild(element);
                }
            }        
        }

        const newCharacterDescription = {mmlCharacterString: doc.body.innerHTML};
        // set it here
        this.currentCharacters.set(userId, newCharacterDescription);
        return newCharacterDescription;
    }



    public registerUserAuthenticator(userAuthenticator: UserAuthenticator) {
        this.userAuthenticator = userAuthenticator;
    }

    public onOwnershipChange(userId: string, inventoryItem: CharacterInventoryItem) {

        // only if ownership is removed, the server needs to get active
        if(!inventoryItem.isOwner(userId)) {
            console.log(`OWNERSHIP REMOVED for ${userId} at ${inventoryItem.uid}`);

            const lastSeenCharacter = this.currentCharacters.get(userId);

            // verify the character
            const newCharacter = this.getAuthorizedCharacterDescription(userId, lastSeenCharacter!);

            if(newCharacter != lastSeenCharacter) {
                if(!this.userAuthenticator) {
                    console.log('Cannot enforce ownership change, no UserNetworkingServer registered.')
                }
                this.userAuthenticator.updateUserCharacter(userId, newCharacter!);
            } 
        }       
    }

    public setup(userId: string, req: Request) {
        // Add setup logic here, e.g. query blockchain based on credentials
        // A centraliezd database etc...
        // For demo, we allow hats only when the passphrase "supersecret" is provided
        if(req.query?.passphrase === "supersecret") {
            this.allItems.inventoryItemBySrc('/assets/models/hat.glb')?.transferOwnership(userId);
        }
    }

    private defineItems() {
        const bot = new CharacterInventoryItem(this, "/assets/models/bot.glb");
        bot.setFreeForAll(true);
        this.allItems.addInventoryItem(bot);

        const hat = new CharacterInventoryItem(this, "/assets/models/hat.glb", null, true);
        this.allItems.addInventoryItem(hat);
    }   
}


export {CharacterController};