// Optional deterministic transport for restricted CI containers with no usable
// ICE interfaces. PeerJS signaling + BinaryPack + application protocol remain
// real, but BroadcastChannel replaces DTLS/SCTP. NEVER shipped in the app.
export function installLocalTransport() {
  class Channel extends EventTarget {
    constructor(id) {
      super(); this.label=id;this.readyState='connecting';this.bufferedAmount=0;this.bufferedAmountLowThreshold=0;
      this.bus=new BroadcastChannel('test-rtc-'+id);
      this.bus.onmessage=({data})=> {
        if(data.closed) {this.close(false);return;}
        const event=new MessageEvent('message',{data:data.bytes});this.onmessage?.(event);this.dispatchEvent(event);
      };
    }
    open() {this.readyState='open';this.onopen?.(new Event('open'));this.dispatchEvent(new Event('open'));}
    send(bytes) {if(this.readyState!=='open') throw new Error('Channel closed');this.bus.postMessage({bytes});}
    close(notify=true) {if(this.readyState==='closed')return;this.readyState='closed';if(notify)this.bus.postMessage({closed:true});this.bus.close();this.onclose?.(new Event('close'));this.dispatchEvent(new Event('close'));}
  }
  window.RTCDataChannel=Channel;
  window.RTCPeerConnection=class extends EventTarget {
    constructor(){super();this.signalingState='stable';this.iceConnectionState='new';this._state='new';}
    get localDescription(){return this._local;}
    get remoteDescription(){return this._remote;}
    get connectionState(){return this._state;}
    get sctp(){return {maxMessageSize:262144};}
    getConfiguration(){return {sdpSemantics:'unified-plan'};}
    createDataChannel(label){this.channel=new Channel(crypto.randomUUID());return this.channel;}
    async createOffer(){return {type:'offer',sdp:this.channel.label};}
    async createAnswer(){return {type:'answer',sdp:this.channel.label};}
    async setLocalDescription(description){this._local=description;}
    async setRemoteDescription(description){
      this._remote=description;
      if(description.type==='offer') {this.channel=new Channel(description.sdp);const event=new Event('datachannel');event.channel=this.channel;Object.defineProperty(event,'target',{value:this});setTimeout(()=>{if(!Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this),'ondatachannel')?.set)this.ondatachannel?.(event);this.dispatchEvent(event);},0);}
      this.iceConnectionState='connected';this._state='connected';
      setTimeout(()=>this.channel.open(),30);
    }
    async addIceCandidate(){}
    async getStats(){return new Map();}
    close(){this.signalingState='closed';this.iceConnectionState='closed';this.channel?.close();}
  };
}
