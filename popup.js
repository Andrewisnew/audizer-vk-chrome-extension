class VkHttpAccessor {
    vkClientId = -1 //vk client id
    scope = 'friends,messages';
    vkAuthenticationUrl = 'https://oauth.vk.com/authorize?client_id=' + this.vkClientId + '&scope=' + this.scope + '&redirect_uri=http%3A%2F%2Foauth.vk.com%2Fblank.html&display=page&response_type=token&v=5.130';
    vkApiHost = "https://api.vk.com/method/";
    version = '5.130';

    getOnlineFriendsIdsEndPoint = "friends.getOnline";
    getUsersByIdsEndPoint = "users.get";
    getAccountProfileInfoEndPoint = "account.getProfileInfo";
    getChatEndPoint = "messages.getChat";
    getHistoryEndPoint = "messages.getHistory";

    fetch(request) {
        console.log('Send: ' + request);
        return fetch(request)
            .then(response => response.json())
            .then(json => {
                console.log('Resp: ' + JSON.stringify(json));
                return json['response'];
            });
    }

    /*
    [id1, id2, ...]
     */
    async getOnlineFriends(vkToken) {
        let request = this.vkApiHost + this.getOnlineFriendsIdsEndPoint + "?access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    getAccountProfileInfo(vkToken) {
        let request = this.vkApiHost + this.getAccountProfileInfoEndPoint + "?access_token=" + vkToken + "&v=" + this.version;
        return this.fetch(request);
    }

    getUsers(userIds, vkToken) {
        let request = this.vkApiHost + this.getUsersByIdsEndPoint + "?user_ids=" + userIds + "&access_token=" + vkToken + "&v=" + this.version;
        return this.fetch(request);
    }

    getChat(chatId, vkToken) {
        let request = this.vkApiHost + this.getChatEndPoint + "?chat_id=" + chatId + "&access_token=" + vkToken + "&v=" + this.version;
        return this.fetch(request);
    }

    getUserFullName(userId, vkToken) {
        return this.getUsers(userId, vkToken)
            .then(response => response[0])
            .then(user => user['first_name'] + ' ' + user['last_name']);
    }

    getUserAvatarUrl(userId, vkToken) {
        return this.getUserById(userId, vkToken)
            .then(response => response[0])
            .then(user => user['photo_50']);
    }

    getMessages(sel, count, offset, vkToken) {
        let peerId;
        if (sel.includes("c")) {
            peerId = 2000000000 + parseInt(sel.substr(1));
        } else {
            peerId = sel;
        }
        let request = this.vkApiHost + this.getHistoryEndPoint + "?peer_id=" + peerId + "&count=" + count + "&offset=" + offset + "&access_token=" + vkToken + "&v=" + this.version;
        return this.fetch(request);
    }

    getCurrentUserAvatarUrl(vkToken) {
        return this.getAccountProfileInfo(vkToken)
            .then(response => response['id'])
            .then(userId => {
                console.log(userId);
                return this.getUserById(userId, vkToken);
            })
            .then(user => user[0]['photo_50']);
    }

    getUserById(userId, vkToken) {
        let request = this.vkApiHost + this.getUsersByIdsEndPoint + "?user_ids=" + userId + "&fields=photo_50" + "&access_token=" + vkToken + "&v=" + this.version;
        return this.fetch(request);
    }

    getCurrentUserId(vkToken) {
        return this.getAccountProfileInfo(vkToken)
            .then(response => response['id'])
    }

    authenticate() {
        let vkAuthenticationUrl = this.vkAuthenticationUrl;
        return new Promise(function (authenticationResolve, authenticationReject) {
            chrome.tabs.create({url: vkAuthenticationUrl, selected: false}, async function (tab) {
                let MAX_REQUESTS_FOR_URL = 300;
                for (let i = 0; i < MAX_REQUESTS_FOR_URL; i++) {
                    let tokenFromParamsPromise = new Promise(function (tokenFromParamsResolve, tokenFromParamsReject) {
                        setTimeout(async function () {
                            let authTab = await chrome.tabs.get(tab.id);
                            let authUrl = authTab.url;
                            console.log(authUrl);
                            let accessTokenFromUrl = getAccessTokenFromUrl(authUrl);
                            if (accessTokenFromUrl !== undefined) {
                                tokenFromParamsResolve(accessTokenFromUrl);
                                chrome.tabs.remove(tab.id);
                            } else {
                                tokenFromParamsReject("token is not ready")
                            }
                        }, 1000)
                    });
                    try {
                        let token = await tokenFromParamsPromise;
                        authenticationResolve(token);
                        return;
                    } catch (err) {
                        console.log(err);
                    }
                }
            });
        });
    }
}

class AudizerHttpAccessor {
    audizerApiHost = ""//server host
    searchEndPoint = "search";

    search(userId, vkToken, secret, audioMessages, searchPattern) {
        let request = this.audizerApiHost + this.searchEndPoint;
        return new Promise(function (audizerSearchResolve, audizerSearchReject) {
            let xhr = new XMLHttpRequest();
            xhr.open("POST", request, true);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("token", vkToken);
            xhr.setRequestHeader("secretKeyword", secret);
            xhr.setRequestHeader("userId", userId);
            xhr.setRequestHeader("messenger", "VK");
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    let json = JSON.parse(xhr.responseText);
                    audizerSearchResolve(json);
                }
            };
            let data = JSON.stringify({
                "searchPattern": searchPattern,
                "extendedMessages": audioMessages
                });
            xhr.send(data);
        }).then(responseJson => {
            return responseJson.result;
        });
    }
}

const vkHttpAccessor = new VkHttpAccessor();
const audizerAccessor = new AudizerHttpAccessor();

function getAccessTokenFromUrl(url) {
    if (!url.includes('access_token')) {
        return undefined;
    }
    return url.substring(url.indexOf('access_token') + 13, url.indexOf('&', url.indexOf('access_token')))
}

function getVkToken() {
    return new Promise(function (vkTokenResolve, vkTokenReject) {
        chrome.storage.sync.get('vkToken', async function (vkTokenContainer) {
            if (vkTokenContainer.vkToken === undefined) {
                try {
                    let token = await vkHttpAccessor.authenticate();
                    chrome.storage.sync.set({vkToken: token}, function () {
                        console.log('Vk token is set' + token);
                        vkTokenResolve(token);
                    });
                } catch (err) {
                    console.log(err);
                }
            } else {
                vkTokenResolve(vkTokenContainer.vkToken);
            }
        });
    });
}

function getSecret() {
    let secretPromise = new Promise(function (secretResolve, secretReject) {
        chrome.storage.sync.get('secret', async function (secretContainer) {
            if (secretContainer.secret === undefined) {
                console.log("Secret not found");
                secretReject(new Error("Secret not found"));
            } else {
                secretResolve(secretContainer.secret);
            }
        });
    });
    return secretPromise.catch(_ => setSecret());
}

function setSecret() {
    let defaultPrompt = "Этот ключ используется для шифрования Ваших сообщений";
    let secret = prompt("Введите Ваш секретный ключ:", defaultPrompt);
    if (secret == null || secret === defaultPrompt || secret.length < 6) {
        return Promise.reject(new Error("Секретный ключ должен быть не менее 6 символов длинной"));
    }
    return new Promise(function (secretStored, secretStoreRejected) {
        chrome.storage.sync.set({secret: secret}, function () {
            console.log('Secret is set: ' + secret.length);
            secretStored(secret);
        });
    });
}

function isAuthorized() {
    return new Promise(function (vkTokenResolve, $) {
        chrome.storage.sync.get('vkToken', async function (vkTokenContainer) {
            if (vkTokenContainer.vkToken === undefined) {
                vkTokenResolve(false);
            } else {
                vkTokenResolve(true);
            }
        });
    });
}

function updateUserSection() {
    return isAuthorized()
        .then(async isAuthorizedLet => {
            if (isAuthorizedLet) {
                document.getElementById("current-user-login").hidden = true;
                document.getElementById("current-user").hidden = false;
                document.getElementById("current-user-menu").hidden = true;
                let vkToken = await getVkToken();
                let currentUser = await vkHttpAccessor.getAccountProfileInfo(vkToken);
                let currentUserAvatarUrl = await vkHttpAccessor.getCurrentUserAvatarUrl(vkToken);
                document.getElementById('current-user-name').innerText = currentUser['first_name'];
                document.getElementById('user-image').src = currentUserAvatarUrl;
            } else {
                document.getElementById("current-user-login").hidden = false;
                document.getElementById("current-user").hidden = true;
            }
        });

}

document.getElementById("user-image").onclick = function () {
    console.log("user-image clicked")
    document.getElementById("current-user-menu").hidden = !document.getElementById("current-user-menu").hidden
}

document.getElementById("current-user-logout").onclick = function () {
    console.log("current-user-logout clicked")
    chrome.storage.sync.remove('vkToken', async function () {
        await updateUserSection();
    })
}

document.getElementById("current-user-login-button").onclick = async function () {
    console.log("current-user-login-button clicked");
    let secretPromise = setSecret();
    let promise = secretPromise.then(async _ => {
        await getVkToken();
        await updateUserSection();
    }, alert);
    await promise;

}
var loadingInProgress = false;
var loadingVersion = 0;
const MAX_MESSAGES_COUNT = 200;

function getAudioMessageById(audioMessages, id) {
    for (let audioMessage of audioMessages) {
        if (audioMessage['messageId'] === id) {
            return audioMessage;
        }
    }
}

document.getElementById("search-button").onclick = async function () {
    let text = document.getElementById("search-text").value;
    if (text === "") {
        return;
    }
    if (loadingInProgress) {
        loadingInProgress = false;
        loadingVersion++;
    }

    let currentVersion = loadingVersion;
    let vkToken = await getVkToken();
    let secret = await getSecret();
    let userId = await vkHttpAccessor.getCurrentUserId(vkToken);
    let idToAvatarUrl = new Map();
    if (currentVersion !== loadingVersion) {
        return;
    }
    let searchResults = document.getElementById("search-results");
    while (searchResults.firstChild) {
        searchResults.removeChild(searchResults.lastChild);
    }
    const REQUEST_MESSAGES_COUNT = 6;
    showLoading();
    for (let offset = 0; offset < MAX_MESSAGES_COUNT; offset += REQUEST_MESSAGES_COUNT) {
        let messages = await vkHttpAccessor.getMessages(chatSel, REQUEST_MESSAGES_COUNT, offset, vkToken);
        let audioMessages = [];
        for (let message of messages['items']) {
            if (message['attachments'].length === 1) {
                if (message['attachments'][0]['type'] === 'audio_message') {
                    let audio = message['attachments'][0]['audio_message'];
                    audioMessages.push({
                        audioUrl: audio['link_mp3'],
                        messageId: message['id'],
                        fromId: message['from_id'],
                        date: message['date'],
                        audioDuration: audio['duration']
                    })
                }
            }
        }
        if (audioMessages.length === 0) {
            continue;
        }
        let searchResult = await audizerAccessor.search(userId, vkToken, secret, audioMessages, text);
        for (let result of searchResult) {
            let audioMessage = getAudioMessageById(audioMessages, result['messageId']);
            if (!idToAvatarUrl.has(audioMessage['fromId'])) {
                let userAvatarUrl = await vkHttpAccessor.getUserAvatarUrl(audioMessage['fromId'], vkToken);
                idToAvatarUrl.set(audioMessage['fromId'], userAvatarUrl);
            }
            let userAvatarUrl = idToAvatarUrl.get(audioMessage['fromId']);
            if (currentVersion !== loadingVersion) {
                return;
            }
            let userHref = "https://vk.com/id" + audioMessage['fromId'];
            searchResults.appendChild(createAudioMessageHtmlElement(userAvatarUrl, audioMessage['audioUrl'], audioMessage['date'], result['text'], text, userHref));
        }

        if (messages['items'].length < REQUEST_MESSAGES_COUNT) {
            hideLoading();
            return;
        }
    }
    hideLoading();
}

function showLoading() {
    document.getElementById("loading-wrapper").hidden = false;
}

function hideLoading() {
    document.getElementById("loading-wrapper").hidden = true;
}

function createAudioMessageHtmlElement(imgUrl, audioUrl, timestamp, text, pattern, userHref) {
    let date = new Date(timestamp * 1000);
    let element = document.createElement("div");
    let imageElement = document.createElement("img");
    imageElement.setAttribute("class", "mes-img");
    imageElement.src = imgUrl;
    imageElement.onclick = function () {
        chrome.tabs.create({url: userHref, selected: false}, async function (tab) {});
    }
    let messageElement = document.createElement("div");
    messageElement.setAttribute("class", "mes-area");
    let sound = document.createElement('audio');
    sound.controls = 'controls';
    let soundSource = document.createElement('source');
    soundSource.setAttribute("src", audioUrl);
    soundSource.setAttribute("type", "audio/mpeg");
    let dateElement = document.createElement("span");
    dateElement.style.color = "white";
    dateElement.innerHTML = date.toLocaleString();
    let imageArrowElement = document.createElement("img");
    let messageTextElement = document.createElement("div");
    imageArrowElement.setAttribute("class", "arrow-img");
    imageArrowElement.src = "/images/down.png";
    imageArrowElement.onclick = function () {
        if (messageTextElement.hidden === true) {
            imageArrowElement.src = "/images/up.png";
            messageTextElement.hidden = false;
        } else {
            imageArrowElement.src = "/images/down.png";
            messageTextElement.hidden = true;
        }
    }
    messageTextElement.setAttribute("class", "mes-text");
    messageTextElement.hidden = true;
    messageTextElement.innerHTML = text.split(pattern).join('<mark>'+pattern+'</mark>');
    sound.appendChild(soundSource);
    messageElement.appendChild(sound);
    messageElement.appendChild(dateElement);
    messageElement.appendChild(imageArrowElement);
    messageElement.appendChild(messageTextElement);
    element.appendChild(imageElement);
    element.appendChild(messageElement);
    return element;
}

//search-box
var chatSel = undefined;
var searchPlaceHolder = undefined;
document.getElementById("search-box").onmouseover = async function () {
    chrome.tabs.query({active: true, currentWindow: true}, tab => {
        let url = tab[0].url;

        if (!url.includes("vk.com/im")) {
            document.getElementById("search-text").placeholder = "Выберите беседу";
            return;
        }
        let sel = new URL(url).searchParams.get("sel");
        if (sel === null) {
            document.getElementById("search-text").placeholder = "Выберите беседу";
            return;
        }
        if (sel === chatSel && searchPlaceHolder !== undefined) {
            document.getElementById("search-text").placeholder = searchPlaceHolder;
            return;
        }
        getVkToken().then(vkToken => {
            if (sel.includes("c")) {
                vkHttpAccessor.getChat(sel.substr(1), vkToken).then(chat => {
                    chatSel = sel;
                    searchPlaceHolder = "Поиск в беседе '" + chat['title'] + "'";
                    document.getElementById("search-text").placeholder = chatSel;
                });

            } else {
                vkHttpAccessor.getUserFullName(sel, vkToken).then(name => {
                    chatSel = sel;
                    searchPlaceHolder = "Поиск в диалоге с " + name;
                    document.getElementById("search-text").placeholder = searchPlaceHolder;
                });
            }
        });
    })
}
updateUserSection();
