// Initialize session when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  initializeSession();
});

// Initialize session when browser starts
chrome.runtime.onStartup.addListener(() => {
  initializeSession();
});

function initializeSession() {
    fetch('http://127.0.0.1:5000/initialize_session', {
        method: 'POST',
        credentials: 'include', 
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        // Log cookies from response
        console.log('Response cookies:', document.cookie);
        console.log('Response headers:', response.headers);
        return response.json();
    })
    .then(data => {
        console.log('Session initialized:', data);
        
        // Check all cookies
        chrome.cookies.getAll({
            domain: "127.0.0.1"
        }, (cookies) => {
            console.log('All cookies:', cookies);
        });
    })
    .catch(error => {
        console.error('Session initialization failed:', error);
        setTimeout(initializeSession, 5000);
    });


}
// Listen for extension reload or browser restart
chrome.runtime.onSuspend.addListener(() => {
  // Optional: Perform cleanup if needed before extension is unloaded
  console.log('Extension being unloaded, session will persist via cookie');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendHTML") {
      fetch('http://127.0.0.1:5000/receive_html', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          html: request.html,
          tabId: sender.tab.id
        })
      })
      .then(response => response.json())
      .then(data => sendResponse(data))
      .catch(error => console.error('Error:', error));
      return true; // Required for async response
    }
    
    if (request.action === "find") {
      const searchParams = new URLSearchParams({
        searchString: request.searchString
      });
      
      fetch(`http://127.0.0.1:5000/search?${searchParams.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'tabId': request.tabId
        }
      })
      .then(response => response.json())
      .then(data => {
        // Send search results to content script
        chrome.tabs.sendMessage(request.tabId, {
          action: "highlightElements",
          elements: data.searchResults.metadatas[0]
        }, () => {
          console.log('Message sent with tabId:', request.tabId);
        });
        sendResponse(data);
      })
      .catch(error => console.error('Error:', error));
      return true;
    }  });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "getTabId") {
          sendResponse(sender.tab.id);
      }
  });
  

// chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
//     if (request.action === "sendHTML") {
//         chrome.storage.local.get('isActive', function(data) {
//             if (data.isActive) {
//                 sendToServer(request.html, request.url);
//             }
//         });
//     }
//     // Keep existing search handler
//     else if (request.action === "search") {
//         sendSearchToServer(request.searchString);
//     }
// });


//   function sendSearchToServer(searchString) {
//     fetch('http://127.0.0.1:5000/search', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         searchString: searchString
//       }),
//     })
//     .then(response => response.json())
//     .then(data => {
//       console.log('Search results:', data);
//       if (data.searchResults) {
//         chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
//           if (tabs && tabs.length > 0) {
//             chrome.tabs.sendMessage(tabs[0].id, {
//               action: "highlightElements",
//               elements: data.searchResults
//             }, function(response) {
//               if (chrome.runtime.lastError) {
//                 console.error('Error sending message:', chrome.runtime.lastError);
//               } else {
//                 console.log('Message sent successfully');
//               }
//             });
//           } else {
//             console.error('No active tab found');
//           }
//         });
//       } else {
//         console.log('No search results found');
//       }
//     })
//     .catch((error) => {
//       console.error('Error sending search:', error);
//     });
//   }

  
// function sendToServer(html, url) {
//   console.log("Sending request to:", 'http://127.0.0.1:5000/receive_html');
//   console.log("Request body:", JSON.stringify({html: html, url: url}));
//   fetch('http://127.0.0.1:5000/receive_html', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({
//       html: html
//     }),
//   })
//   .then(response => {
//     if (!response.ok) {
//       return response.text().then(text => {
//         throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
//       });
//     }
//     return response.json();
//   })
//   .then(data => {
//     console.log('Success:', data);
//   })
//   .catch((error) => {
//     console.error('Error:', error);
//   });
//   console.log("sent to server");
// }
