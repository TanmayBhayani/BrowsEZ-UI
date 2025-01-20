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