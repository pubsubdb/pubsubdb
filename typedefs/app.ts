interface App {
  name: string;
  title: string;
  description: string;
}

type AppVersion = {
  version: string;
  id: string;
};

export { App, AppVersion };
