javascript: (function(e){var t={eval:'"\\"closereading_lesson\\"==document.getElementsByTagName(\\"iframe\\")[0].id?(csid=closereading_lesson.src.split(\\"?csid=\\")[1].split(\\"#\\")[0],closereading_lesson.contentDocument.getElementsByClassName(\\"button fa fa-play pulse\\")[0].click()):csid=html5Iframe.src.split(\\"?csid=\\")[1].split(\\"&type\\")[0];var url=prompt(\\"Welcome to IRSRC v1.0.9b\\\\nPlease enter \'skip\' to use IRLS}\\\\n\\\\nOR enter \'test\' to go to modify diagnoistic answers.\\\\n\\\\n\\\\nOR enter \'minute\' to use IReady Minute Faker (IRMF).\\\\n\\\\n\\\\n\\\\n(WARNING IM NOT LIABLE IF YOU GET IN TROUBLE!)\\\\n\\\\n\\\\n\\\\n\\\\n- ♥ Zach ♥\\",placeholder=\\"//www.google.com/?igu=1\\");if(\\"skip\\"==url){alert(\\"Run IRLS 2 times to skip full lesson...\\");var score=\'{\\"score\\":100}\';fetch(\\"https://login.i-ready.com/student/lesson/componentCompleted\\",{headers:{accept:\\"*/*\\",\\"accept-language\\":\\"en-US,en;q=0.9\\",\\"content-type\\":\\"application/json;charset=UTF-8\\",\\"sec-fetch-dest\\":\\"empty\\",\\"sec-fetch-mode\\":\\"cors\\",\\"sec-fetch-site\\":\\"same-origin\\",\\"sec-gpc\\":\\"1\\"},referrer:\\"https://login.i-ready.com/student/dashboard/home\\",referrerPolicy:\\"strict-origin-when-cross-origin\\",body:%60{\\"componentStatusId\\":\\"${csid}\\",\\"instructionLessonOutcome\\":${score}}%60,method:\\"POST\\",mode:\\"cors\\",credentials:\\"include\\"})}else if(\\"test\\"===url)if(confirm(\\"Click OK to enable Diagnostic answer modifier. Click Cancel to turn off IRDS.\\")){alert(\\"Enabling IRDS... Please wait...\\");var duration=1e3;setTimeout((function(){XMLHttpRequest.prototype.realSend=XMLHttpRequest.prototype.send,XMLHttpRequest.prototype.send=function(e){newBody=JSON.parse(e),0==newBody.correct&&(newBody.correct=!0),null!=newBody.durationSeconds&&(newBody.durationSeconds=duration),this.realSend(JSON.stringify(newBody))},alert(\\"Hack was enabled. All answers inputted in diagnostic will be correct.\\")}),2e3)}else alert(\\"Turning off IRDS...\\"),XMLHttpRequest.prototype.send=XMLHttpRequest.prototype.realSend,XMLHttpRequest.prototype.realSend=void 0,alert(\\"IRDS Has Turned Off\\");else if(\\"minute\\"===url){var url2=prompt(\\"\\\\t\\\\tWelcome to IRMF v1.0.1a\\\\n\\\\t\\\\tPlease enter \'config\' to start IRMF process.}\\\\n\\\\n\\\\t\\\\tThen close out of your lesson, and then enter \'start\' to fully enable.\\\\n\\\\n\\\\n\\\\t\\\\tOR enter \'end\' to use IReady Minute Faker (IRMF).\\\\n\\\\n\\\\n\\\\n\\\\t\\\\t- ♥ Zach ♥\\",placeholder2=\\"//www.google.com/?igu=1\\");if(\\"config\\"===url2){var csid=html5Iframe.src.split(\\"?csid=\\")[1].split(\\"&type\\")[0],minutes=45;document.cookie=%60csid=${csid}; expires=Thu, 18 Dec 2999 12:00:00 UTC\\"%60,document.cookie=%60minutes=${minutes}; expires=Thu, 18 Dec 2999 12:00:00 UTC\\"%60}else if(url2=\\"start\\"){function getCookie(e){for(var t=e+\\"=\\",n=decodeURIComponent(document.cookie).split(\\";\\"),o=0;o<n.length;o++){for(var s=n[o];\\" \\"==s.charAt(0);)s=s.substring(1);if(0==s.indexOf(t))return s.substring(t.length,s.length)}return\\"\\"}csid=getCookie(\\"csid\\"),fetch(%60https://login.i-ready.com/student/v1/web/lesson_component/${csid}?action=resume%60,{headers:{accept:\\"application/json, text/plain, */*\\",\\"accept-language\\":\\"en-US,en;q=0.9\\",\\"sec-fetch-dest\\":\\"empty\\",\\"sec-fetch-mode\\":\\"cors\\",\\"sec-fetch-site\\":\\"same-origin\\"},referrer:\\"https://login.i-ready.com/student/dashboard/home\\",referrerPolicy:\\"strict-origin-when-cross-origin\\",body:null,method:\\"GET\\",mode:\\"cors\\",credentials:\\"include\\"})}else if(\\"end\\"===url2){function getCookie(e){for(var t=e+\\"=\\",n=decodeURIComponent(document.cookie).split(\\";\\"),o=0;o<n.length;o++){for(var s=n[o];\\" \\"==s.charAt(0);)s=s.substring(1);if(0==s.indexOf(t))return s.substring(t.length,s.length)}return\\"\\"}csid=getCookie(\\"csid\\"),fetch(%60https://login.i-ready.com/student/v1/web/lesson_component/${csid}?action=pause%60,{headers:{accept:\\"application/json, text/plain, */*\\",\\"accept-language\\":\\"en-US,en;q=0.9\\",\\"sec-fetch-dest\\":\\"empty\\",\\"sec-fetch-mode\\":\\"cors\\",\\"sec-fetch-site\\":\\"same-origin\\"},referrer:\\"https://login.i-ready.com/student/dashboard/home\\",referrerPolicy:\\"strict-origin-when-cross-origin\\",body:null,method:\\"GET\\",mode:\\"cors\\",credentials:\\"include\\"})}}"'},o=!0;if("object"==typeof this.artoo&&(artoo.settings.reload||(artoo.log.verbose("artoo already exists within this page. No need to inject him again."),artoo.loadSettings(t),artoo.exec(),o=!1)),o){var n=document.getElementsByTagName("body")[0];n||(n=document.createElement("body"),document.firstChild.appendChild(n));var s=document.createElement("script");console.log("artoo.js is loading..."),s.src="//medialab.github.io/artoo/public/dist/artoo-latest.min.js",s.type="text/javascript",s.id="artoo_injected_script",s.setAttribute("settings",JSON.stringify(t)),n.appendChild(s)}}).call(this);