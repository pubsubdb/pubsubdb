interface App {
  name: string;
  title: string;
  description: string;
}

type AppVersion = {
  version: string;
  id: string;
};

type AppTransitions = {
  [key: string]: Record<string, unknown>;
};

type AppSubscriptions = {
  [key: string]: string;
};


export { App, AppVersion, AppTransitions, AppSubscriptions };
