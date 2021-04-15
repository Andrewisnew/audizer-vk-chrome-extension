

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

    async fetch(request) {
        console.log('Send: ' + request);
        let response = await fetch(request);
        let json = (await response.json());
        console.log('Resp: ' + JSON.stringify(json));
        return json['response'];
    }

    /*
    [id1, id2, ...]
     */
    async getOnlineFriends(vkToken) {
        let request = this.vkApiHost + this.getOnlineFriendsIdsEndPoint + "?access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    async getAccountProfileInfo(vkToken) {
        let request = this.vkApiHost + this.getAccountProfileInfoEndPoint + "?access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    async getUsers(userIds, vkToken) {
        let request = this.vkApiHost + this.getUsersByIdsEndPoint + "?user_ids=" + userIds + "&access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    async getChat(chatId, vkToken) {
        let request = this.vkApiHost + this.getChatEndPoint + "?chat_id=" + chatId + "&access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    async getUserFullName(userId, vkToken) {
        let user = (await this.getUsers(userId, vkToken))[0];
        return user['first_name'] + ' ' + user['last_name'];
    }

    async getMessages(userId, count, vkToken) {
        let request = this.vkApiHost + this.getHistoryEndPoint + "?user_id=" + userId + "&count=" + count + "&access_token=" + vkToken + "&v=" + this.version;
        return await this.fetch(request);
    }

    async getCurrentUserAvatarUrl(vkToken) {
        let userId = (await this.getAccountProfileInfo(vkToken))['id'];
        console.log(userId);

        let request = this.vkApiHost + this.getUsersByIdsEndPoint + "?user_ids=" + userId + "&fields=photo_50" + "&access_token=" + vkToken + "&v=" + this.version;
        let responseJson = await this.fetch(request);
        return responseJson[0]['photo_50'];
    }

    async authenticate() {
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

const vkHttpAccessor = new VkHttpAccessor();

function getAccessTokenFromUrl(url) {
    if (!url.includes('access_token')) {
        return undefined;
    }
    return url.substring(url.indexOf('access_token') + 13, url.indexOf('&', url.indexOf('access_token')))
}

async function getVkToken() {
    let vkTokenPromise = new Promise(function (vkTokenResolve, vkTokenReject) {
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
    return await vkTokenPromise;
}

async function isAuthorized() {
    let isAuthorizedPromise = new Promise(function (vkTokenResolve, $) {
        chrome.storage.sync.get('vkToken', async function (vkTokenContainer) {
            if (vkTokenContainer.vkToken === undefined) {
                vkTokenResolve(false);
            } else {
                vkTokenResolve(true);
            }
        });
    });
    return await isAuthorizedPromise;
}


async function updateUserSection() {
    let isAuthorizedLet = await isAuthorized();
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
    console.log("current-user-login-button clicked")
    await getVkToken();
    await updateUserSection();
}
var loadingInProgress = false;
var loadingVersion = 0;
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
    // if (!loadingInProgress || currentVersion !== loadingVersion) {
    //     return;
    // }
    let searchResults = document.getElementById("search-results");
    while (searchResults.firstChild) {
        searchResults.removeChild(searchResults.lastChild);
    }
    if (chatSel.includes("c")) {

    } else {
        let messages = await vkHttpAccessor.getMessages(chatSel, 10, vkToken);
        for (let message of messages['items']) {
            if (message['attachments'].length === 1) {
                if (message['attachments'][0]['type']  === 'audio_message') {
                    let audio = message['attachments'][0]['audio_message'];
                    let id = audio['id'];
                    let mp3 = audio['link_mp3'];
                    console.log(mp3);
                    searchResults.appendChild(createAudioMessageHtmlElement(document.getElementById('user-image').src, mp3));
                }
            }
        }
    }
}
function createAudioMessageHtmlElement(imgUrl, audioUrl) {
    let element = document.createElement("div");
    let imageElement = document.createElement("img");
    imageElement.setAttribute("class", "mes-img");
    imageElement.src = imgUrl;
    let messageElement = document.createElement("div");
    messageElement.setAttribute("class", "mes-area");
    let sound = document.createElement('audio');
    sound.controls = 'controls';
    let soundSource = document.createElement('source');
    soundSource.setAttribute("src", audioUrl);
    soundSource.setAttribute("type", "audio/mpeg");

    sound.appendChild(soundSource);
    messageElement.appendChild(sound);
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



