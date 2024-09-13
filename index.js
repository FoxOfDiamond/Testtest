const http=require('http');
const socketIo=require('socket.io')
const fs=require('fs');
const sqlite=require('sqlite3');
const { create } = require('domain');
const { randomUUID } = require('crypto');
var db;
function cookieExists(c,cname){
    let ret=0
    if(c){
        c=c.replace(" ","")
        c=c.split(';');
        c.forEach((val)=>{
            if (val.split('=')[0]==cname){
                ret=val.split('=')[1];
            }
        });
    }
    return ret;
}

const server=http.createServer((req,res)=>{
    console.warn("Client requested");
    let cookie=req.headers.cookie;
    let authedas=false;
    cookie=cookieExists(cookie,"auth");
    db.all(`select username from LoginData where authcookie="`+cookie+`"`,(err,redata)=>{
        if (redata[0]){
            authedas=redata[0].username;
        }
        let path=req.url.replace(/\/+$/, "")
        path=path.split("/");
        path.splice(0,1);
        if (path[0]=="favicon.ico"){return}
        function addFormAndSend(data){
            if (authedas){
                fs.readFile("logoutForm","utf-8",(err,redt)=>{
                    if(err){console.error(err);}
                    data=data.replace("{{LOGINFORM}}","Logged in as "+authedas+"<br>"+redt);
                    data=data.replace(/\{{.*?\}}/g,'');
                    res.write(data);
                    res.end();
                })
            }else{
                fs.readFile("loginForm","utf-8",(err,redt)=>{
                    if(err){console.error(err);}
                    data=data.replace("{{LOGINFORM}}",redt);
                    data=data.replace(/\{{.*?\}}/g,'');
                    res.write(data);
                    res.end();
                })
            }
        }
        switch (req.method){
            case("GET"):
            switch (path[0]){
                case(undefined):
                    fs.readFile("main.html","utf-8",(err,data)=>{
                        if (err){
                            console.error(err);
                        }
                        else{
                            let userstring="";
                            db.all(`
                                select username from LoginData
                            `,(err,dat)=>{
                                if (err) {console.error(err);return}
                                dat.forEach(element => {
                                    userstring+='<a href="/user/'+element.username+'/">'+element.username+'</a><br>';
                                });
                                data=data.replace("{{SEEALLUSERS}}",userstring);
                                addFormAndSend(data);
                            })
                        }
                    });
                break;
                case("user"):
                    fs.readFile("user.html","utf-8",(err,data)=>{
                        if (err){
                            console.error(err);
                        }
                        else{
                            db.all(`select * from LoginData where username="`+path[1]+`"`,(err,usdta)=>{
                                if(err){console.error(err)}
                                if ((usdta.length)==0){
                                    data=data.replace("{{USERDATA}}","No username found")
                                    addFormAndSend(data);
                                }else{
                                    let dtstring="Username:"+usdta[0].username+"<br>";
                                    if (usdta[0].profile){
                                        dtstring+="Profile:"+usdta[0].profile+"<br>"
                                    }else{
                                        dtstring+="Profile not set<br>"
                                    }
                                    data=data.replace("{{USERDATA}}",dtstring)
                                    if (authedas==usdta[0].username){
                                        fs.readFile("editButton","utf-8",(err,redt)=>{
                                            if(err){console.error(err);}
                                            data=data.replace("{{EDITBUTTON}}",redt);
                                            addFormAndSend(data);
                                        })
                                    }else{
                                        addFormAndSend(data);
                                    }
                                }
                            })
                        }
                    });
                break;
                case("edit"):
                    fs.readFile("edit.html","utf-8",(err,data)=>{
                        if (authedas){
                            fs.readFile("editForm","utf-8",(err,pform)=>{
                                data=data.replace("{{USERDATA}}","Username:"+authedas+"<br>"+"Profile:<br>"+pform);
                                fs.readFile("saveButton","utf-8",(err,sbt)=>{
                                    data=data.replace("{{SAVEBUTTON}}",sbt);
                                    db.all(`select * from LoginData where username="`+authedas+`"`,(err,usdta)=>{
                                        data=data.replace("{{OLDPROFILE}}",usdta[0].profile);
                                        addFormAndSend(data);
                                    })
                                });
                            })
                        }else{
                            addFormAndSend(data);
                        }
                    })
                break;
                case("chat"):
                    fs.readFile("chat.html","utf-8",(err,data)=>{
                        if (authedas){
                            fs.readFile("chatbox","utf-8",(err,efrm)=>{
                                data=data.replace("{{CHATBOX}}",efrm)
                                data=data.replace("{{USERNAME}}",authedas+":")
                                addFormAndSend(data);
                            })
                        }else{
                            addFormAndSend(data);
                        }
                    })
                break;
                default:
                    res.writeHead(301, {
                        Location: `/`
                      }).end();
                break;
            }
            break;
            case("POST"):
            console.warn("Posted with:");
            req.on('data',(dt)=>{
                const result=JSON.parse(dt.toString());
                console.warn(result);
                    switch (result.request){
                        case("logOut"):
                        res.setHeader('Set-Cookie',['auth=deleted']);
                        res.writeHead(200,{'Content-Type': 'text/plain'});
                        if(authedas){
                            res.write("Logged out successful");
                            db.exec(`
                                update LoginData set authcookie=null where username="`+authedas+`"
                            `);
                            res.end();
                        }else{
                            res.write("Not even logged in lol");
                            res.end();
                        }
                        break;
                        case("signUp"):
                        db.all(`
                            select exists(select 1 from LoginData where username="`+result.username+'")'
                        ,(err,reslt)=>{
                            if (err){
                                console.error(err)
                            }
                            if (reslt[0]['exists(select 1 from LoginData where username="'+result.username+'")']==0){
                                console.log("username not found, valid");
                                db.exec(`
                                    insert into LoginData(username, password)
                                    values('`+result.username+`', '`+result.password+`');
                                `);
                                console.log("Account created!");
                                res.write("Account created");
                                res.end();
                            }else{
                                console.log("username already exists");
                                res.write("Username already exists");
                                res.end();
                            }
                        });
                        break;
                        case("signIn"):
                        db.all(`
                            select exists(select 1 from LoginData where username="`+result.username+'")'
                        ,(err,reslt)=>{
                        if (err){
                            console.error(err)
                        }
                        if (reslt[0]['exists(select 1 from LoginData where username="'+result.username+'")']==0){
                            console.log("username not found");
                            res.write("Wrong username");
                            res.end();
                        }else{
                            db.all(`
                                select * from LoginData where username="`+result.username+`" and password="`+result.password+`"
                            `,(err,reslt)=>{
                                if (err){
                                    console.error(err);
                                }
                                if (reslt.length==0){
                                    console.warn("Wrong password");
                                    res.write("Wrong password");
                                    res.end();
                                }else{
                                    console.warn("Logged in successful");
                                    const cookie=randomUUID();
                                    db.exec(`
                                        update LoginData set authcookie="`+cookie+`" where username="`+result.username+`"
                                    `);
                                    res.setHeader('Set-Cookie',['auth='+cookie]);
                                    res.writeHead(200,{'Content-Type': 'text/plain'});
                                    res.write("Logged in");
                                    res.end();
                                }
                            });
                        }});
                        break;
                        case("edit"):
                            db.exec(`
                                update LoginData set profile="`+result.profile+`" where username="`+authedas+`"    
                            `)
                            res.write("Edit succcessful/"+authedas);
                            res.end();
                        break;
                        }
            });
            break;
        }
    });
});
socketServer=socketIo(server,{path:"/chat"})
socketServer.on('message',(msg)=>{
    console.warn(msg);
})
socketServer.on('connection',(socket)=>{
    console.warn("Client connnected at "+socket.id);
    socket.on('auth',(cookie)=>{
        cookie=cookieExists(cookie,"auth");
        let authedas="A guest";
        db.all(`select username from LoginData where authcookie="`+cookie+`"`,(err,authdata)=>{
            if (authdata[0]){
                authedas=authdata[0].username;
                socket.on('message',(msg)=>{
                    socketServer.emit('message',authedas+":"+msg)
                })
            }
            socketServer.emit('message',"<b>"+authedas+" joined the room<b>")
        });
    })
})
server.listen(1000,()=>{
    console.log("Listening on port 1000")
});
function regenerateDatabase(name){
    if (!fs.existsSync(name+".db")){
        new sqlite.Database(name+".db",(err)=>{
            console.error(err);
        });
        console.log("Database created, initializing");
    }else{
        console.log("Database exists");
    }
    db=new sqlite.Database(name+".db", (err)=>{
        if (err){
            console.error(err);
        }
    });
    console.log("Connected to database "+name);
    db.exec(`
        create table if not exists LoginData(
            username text primary key not null,
            password text not null,
            authcookie text,
            profile text
        );
    `);
    db.all(`
        select exists(select 1 from LoginData where username="dummy");
    `,(err,result)=>{
        if (err){
            console.error(err);
        }
        if (result[0]['exists(select 1 from LoginData where username="dummy")']==0){
            console.log("Dummy not found, creating");
            db.exec(`
                insert into LoginData(username, password)
                values('dummy', '12345');
            `);
        }else{
            console.log("Dummy exists");
        }
    });

}
regenerateDatabase("UserData");