import crypto from "crypto";
import request from 'request';
import WebSocket from 'ws';
import process from 'process';

const syncNode: string = process.env.SYNC_NODE ?? "https://tenebra.lil.gay";
const privKey: string = process.env.PRIVATE_KEY ?? "123";

//Thanks Lemmmy for this code i stole (for all of address generation)

function sha256(...inputs: any[]) {
    let hash = crypto.createHash("sha256");
    for (const input of inputs) {
      hash = hash.update(input instanceof Uint8Array ? input : input.toString());
    }
    return hash.digest("hex");
  };
  
function hexToBase36(input: number) {
    for (let i= 6; i <= 251; i += 7) {
      if (input <= i) {
        if (i <= 69) {
          return String.fromCharCode(("0".charCodeAt(0)) + (i - 6) / 7);
        }
  
        return String.fromCharCode(("a".charCodeAt(0)) + ((i - 76) / 7));
      }
    }
  
    return "e";
  };

function makeV2Address (key: string) {
    const chars = ["", "", "", "", "", "", "", "", ""];
    let prefix = "t";
    let hash = sha256(sha256(key));
  
    for (let i = 0; i <= 8; i++) {
      chars[i] = hash.substring(0, 2);
      hash = sha256(sha256(hash));
    }
  
    for (let i = 0; i <= 8;) {
      const index = parseInt(hash.substring(2 * i, 2 + (2 * i)), 16) % 9;
  
      if (chars[index] === "") {
        hash = sha256(hash);
      } else {
        prefix += hexToBase36(parseInt(chars[index], 16));
        chars[index] = "";
        i++;
      }
    }
  
    return prefix;
};

request.post(
    syncNode + '/ws/start',
    function (error, response, body) {
        if (!error && response.statusCode == 200) {
			const data = JSON.parse(body);
            const cws = new WebSocket(data.url);
            const address = makeV2Address(privKey);
            let messageId: number = 1;
            let curHash: string = "";

            console.log("Connected to", syncNode);

			cws.on('open', function open() {
                const login = {"id": messageId, "type": "login", "privatekey": privKey};
				cws.send(JSON.stringify(login))
                messageId++;
				const subscribeValidators = {"id": messageId, "type": "subscribe", "event": "ownValidators"};
				cws.send(JSON.stringify(subscribeValidators))
                messageId++;
                const subscribeBlocks = {"id": messageId, "type": "subscribe", "event": "blocks"};
				cws.send(JSON.stringify(subscribeBlocks))
                messageId++;
			});

			cws.on('message', function incoming(data: string) {
				const messageData = JSON.parse(data);
				if (messageData.type === "hello") {
					curHash = messageData.last_block.hash;
                    console.log("Received hello block", curHash);
				} else if (messageData.type === "event" && messageData.event === "block") {
					curHash = messageData.block.hash;
                    console.log("Received new block", curHash);
				} else if (messageData.type === "event" && messageData.event === "validator") {
                    const nonce = crypto.randomBytes(16).toString('base64');
                    const hashString = address + curHash.substring(0, 12) + nonce;
                    const resultingBlock = sha256(hashString);
                    console.log("Submitting block", resultingBlock, "with nonce", nonce);

                    const submitBlock = {"id": messageId, "type": "submit_block", "nonce": nonce};
				    cws.send(JSON.stringify(submitBlock))
                    messageId++;
                } else if (messageData.ok && messageData.hasOwnProperty('isGuest') && messageData.address) {
                    console.log("Authed as", messageData.address.address);
                }
			});
        }
    }
);
