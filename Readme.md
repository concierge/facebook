## Facebook Integration
#### Installation
The easiest way to install this integration is to use KPM.
```sh
/kpm install facebook
```

#### Configuration
To add a configuration, execute each of the following commands (replace each of the angle bracketed strings with the respective information):
```sh
/kpm config facebook username "<facebookEmail>"
/kpm config facebook password "<facebookPassword>"
/kpm config facebook commandPrefix "/"
```

#### Running
To run Facebook, either run `node main.js facebook` when starting Concierge or run `/kpm start facebook` when Concierge is running.

<b>Note: the account that is logged in as will NOT be able to command it. The reasons behind this are documented [here](https://github.com/concierge/Concierge/issues/77#issuecomment-209161404) and [here](https://github.com/concierge/Concierge/issues/77#issuecomment-181676118).</b>
