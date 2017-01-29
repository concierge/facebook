const fb = require('facebook-chat-api'),
    fs = require('fs');

let stopListeningMethod = null,
    platform = null,
    endTyping = null,
    platformApi = null,
    unknownIter = 1,
    threadInfo = {};

const getSenderInfo = (ids, api, event, finished) => {
    const callback = (err, info) => {
        if (err) {
            return finished('<Unknown User ' + unknownIter++ + '>');
        }
        for (let id in info) {
            threadInfo[event.threadID][id] = {
                name: info[id].name,
                email: 'unknown@foo.bar'
            };
        }
        return finished(threadInfo[event.threadID][event.senderID].name);
    };
    api.getUserInfo(ids, callback);
};

const getSenderName = (api, event, finished) => {
    if (threadInfo[event.threadID] && threadInfo[event.threadID][event.senderID]) {
        return finished(threadInfo[event.threadID][event.senderID].name);
    }

    if (!threadInfo[event.threadID]) {
        threadInfo[event.threadID] = {};
        api.getThreadInfo(event.threadID, (err, info) => {
            if (err) {
                return finished('<Unknown User ' + unknownIter++ + '>');
            }
            getSenderInfo(info.participantIDs, api, event, finished);
        });
    }
    else {
        getSenderInfo([event.senderID], api, event, finished);
    }
};

const stopTyping = () => {
    if (endTyping) {
        endTyping();
        endTyping = null;
    }
};

class FacebookIntegration extends shim {
    sendMessage (message, thread) {
        stopTyping();
        if (!thread) {
            throw new Error('A thread ID must be specified.');
        }
        api.sendMessage({body:message}, thread);
    }
    
    sendUrl (url, thread) {
        stopTyping();
        api.sendMessage({body: url, url: url}, thread);
    }
    
    sendImage (type, image, description, thread) {
        stopTyping();
        switch (type) {
        case 'url':
            api.sendMessage({body: description, url: image}, thread, err => {
                if (err) {
                    api.sendMessage(`${description} ${image}`, thread);
                }
            });
            break;
        case 'file':
            api.sendMessage({body: description, attachment: fs.createReadStream(image)}, thread);
            break;
        default:
            api.sendMessage(description, thread);
            api.sendMessage(image, thread);
            break;
        }
    }
    
    sendTyping (thread) {
        stopTyping();
        api.sendTypingIndicator(thread, (err, end) => {
            if (!err) {
                endTyping = end;
            }
        });
    }
    
    setTitle (title, thread) {
        stopTyping();
        api.setTitle(title, thread);
    }
    
    getUsers (thread) {
        return threadInfo[thread];
    }
};

exports.getApi = () => {
    return platform;
};

exports.start = callback => {
    fb({email: exports.config.username, password: exports.config.password}, (err, api) => {
        if (err) {
            console.error(err);
            throw new Error(err);
        }

        api.setOptions({
            listenEvents: true,
            logLevel: !console.isDebug() ? 'silent' : void(0)
        });
        
        platformApi = api;
        platform = new PlatformIntegration(exports.config.commandPrefix);

        const stopListening = api.listen((err, event) => {
            if (err) {
                stopListening();
                throw new Error(err);
            }

            switch (event.type) {
            case 'message':
                getSenderName(api, event, name => {
                    const data = shim.createEvent(event.threadID, event.senderID, name, event.body + '');
                    callback(platform, data);
                });
                break;
            case 'event':
            let usrs;
                switch (event.logMessageType) {
                case 'log:unsubscribe':
                    usrs = event.logMessageData.removed_participants;
                    for (let i = 0; i < usrs.length; i++) {
                        usrs[i] = usrs[i].split(':')[1];
                        if (threadInfo[event.threadID] && threadInfo[event.threadID][usrs[i]]) {
                            delete threadInfo[event.threadID][usrs[i]];
                        }
                    }
                    break;
                case 'log:subscribe':
                    usrs = event.logMessageData.added_participants;
                    for (let i = 0; i < usrs.length; i++) {
                        usrs[i] = usrs[i].split(':')[1];
                    }
                    getSenderInfo(usrs, api, event, () => {});
                    break;
                }
                break;
            }
        });

        stopListeningMethod = () => {
            stopListening();
            api.logout();
        };
    });
};

exports.stop = () => {
    stopTyping();
    platform = null;
    if (stopListeningMethod) {
        stopListeningMethod();
        stopListeningMethod = null;
    }
    platformApi = null;
    threadInfo = {};
};
