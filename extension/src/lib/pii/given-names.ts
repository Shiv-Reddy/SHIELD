/**
 * Common given names — Indian first, then global — for detecting a person's
 * name in running prose.
 *
 * WHAT THIS IS, AND THE CLAIM IT DOES NOT SUPPORT
 *
 * A gazetteer. It recognises names on this list and misses every name that is
 * not on it — most non-Indian names, most rare ones, and anything spelled
 * unusually. **It is not a named-entity model and must never be described as
 * one.** SECURITY_PRIVACY.md Section 5.1 carries the honest wording.
 *
 * WHY GIVEN NAMES AND NOT SURNAMES
 *
 * Given names are a small set with high coverage — a few hundred account for a
 * large share of the population. Surnames run to tens of thousands and a list
 * of them would be both enormous and thin. So the rule is "a listed given name
 * followed by another capitalised word", and that second word is NOT checked
 * against anything. That is what lets it find surnames it has never seen.
 *
 * HOW THIS LIST WAS BUILT, WHICH MATTERS MORE THAN WHAT IS IN IT
 *
 * Written from common Indian given names generally, BEFORE looking at which
 * names the benchmark corpus happens to contain. It includes Priya, Rohan,
 * Arjun, Meera and Vikram because those are among the commonest names in India
 * — not because they are the answers. A gazetteer assembled by reading the
 * corpus would score perfectly on it and generalise to nothing, which is the
 * same trap DECISIONS.md records for fixtures: a test you optimise against has
 * stopped being a test.
 *
 * Lowercased on the way in so the comparison is cheap and case-insensitive.
 * Stored as a Set because this is checked once per capitalised token on a page.
 */

const NAMES = [
  // Masculine, broadly pan-Indian
  'aarav', 'aayan', 'abhay', 'abhinav', 'abhishek', 'aditya', 'ajay', 'akash',
  'akhil', 'akshay', 'amit', 'amol', 'anand', 'aniket', 'anil', 'anirudh',
  'ankit', 'ankur', 'anuj', 'arjun', 'arun', 'aryan', 'ashish', 'ashok',
  'atul', 'avinash', 'ayush', 'balaji', 'bharat', 'bhavesh', 'chetan',
  'chirag', 'darshan', 'deepak', 'dev', 'devendra', 'dhruv', 'dinesh',
  'gaurav', 'girish', 'gopal', 'govind', 'harish', 'harsh', 'hemant',
  'hitesh', 'imran', 'irfan', 'ishaan', 'jagdish', 'jatin', 'jay', 'jayesh',
  'kabir', 'kailash', 'kamal', 'karan', 'kartik', 'kaushik', 'keshav',
  'kishore', 'krishna', 'kunal', 'lakshman', 'lalit', 'madhav', 'mahesh',
  'manish', 'manoj', 'mayank', 'mohan', 'mohit', 'mukesh', 'murali',
  'naresh', 'naveen', 'neeraj', 'nikhil', 'nilesh', 'nitin', 'om', 'omkar',
  'pankaj', 'paras', 'parth', 'pavan', 'pradeep', 'prakash', 'pranav',
  'prashant', 'prateek', 'praveen', 'prem', 'pulkit', 'radhe', 'raghav',
  'rahul', 'raj', 'rajan', 'rajesh', 'rakesh', 'ram', 'raman', 'ramesh',
  'ranjit', 'ravi', 'rehan', 'rishabh', 'rishi', 'rohan', 'rohit', 'rupesh',
  'sachin', 'sagar', 'sahil', 'sameer', 'sandeep', 'sanjay', 'sankar',
  'santosh', 'satish', 'satyanand', 'saurabh', 'shankar', 'shashank',
  'shekhar', 'shiv', 'shivam', 'shreyas', 'shyam', 'siddharth', 'sohail',
  'somnath', 'srinivas', 'subhash', 'sudhir', 'sumit', 'sunil', 'suraj',
  'suresh', 'tanmay', 'tarun', 'tushar', 'udit', 'ujjwal', 'umesh', 'utkarsh',
  'varun', 'vedant', 'venkat', 'vijay', 'vikas', 'vikram', 'vimal', 'vinay',
  'vinod', 'vipul', 'viraj', 'vishal', 'vishnu', 'vivek', 'yash', 'yogesh',
  'zaid',

  // Feminine, broadly pan-Indian
  'aarti', 'aditi', 'advika', 'aishwarya', 'akanksha', 'alka', 'amrita',
  'ananya', 'anita', 'anjali', 'anju', 'ankita', 'anu', 'anushka', 'aparna',
  'archana', 'arpita', 'asha', 'ayesha', 'bhavana', 'bhavna', 'chitra',
  'deepa', 'deepika', 'devi', 'dhara', 'divya', 'ekta', 'esha', 'gayatri',
  'geeta', 'gita', 'gouri', 'harini', 'hema', 'indira', 'isha', 'ishita',
  'jaya', 'jyoti', 'kajal', 'kalpana', 'kamala', 'kanchan', 'kavita',
  'kavya', 'khushi', 'kiran', 'komal', 'kriti', 'lakshmi', 'lata', 'leela',
  'madhuri', 'mala', 'malini', 'mamta', 'manisha', 'maya', 'meena', 'meera',
  'megha', 'mira', 'mitali', 'mona', 'mukta', 'nandini', 'neelam', 'neena',
  'neha', 'nidhi', 'nikita', 'nisha', 'nitya', 'padma', 'pallavi', 'parul',
  'pooja', 'poonam', 'prachi', 'pragya', 'pratibha', 'preeti', 'prerna',
  'priya', 'priyanka', 'radha', 'radhika', 'rajni', 'rakhi', 'rani', 'rashmi',
  'reena', 'rekha', 'renu', 'richa', 'riddhi', 'ritu', 'riya', 'rupa',
  'saloni', 'sana', 'sandhya', 'sangeeta', 'sanjana', 'sarika', 'saroj',
  'savita', 'seema', 'shalini', 'shanti', 'sharmila', 'shefali', 'shilpa',
  'shobha', 'shreya', 'shruti', 'shweta', 'simran', 'sneha', 'sonal', 'sonia',
  'sonu', 'srishti', 'suchitra', 'sudha', 'sujata', 'sunita', 'supriya',
  'surbhi', 'sushma', 'swati', 'tanvi', 'tanya', 'tara', 'trisha', 'uma',
  'urmila', 'usha', 'vaishali', 'vandana', 'vani', 'varsha', 'veena',
  'vidya', 'vinita', 'yamini', 'yashoda', 'zoya',
] as const;

/**
 * Common given names from outside India.
 *
 * Added after a live check on a real HR product (the OrangeHRM public demo)
 * and a real table page (the-internet.herokuapp.com): "Cory Yamamoto" in the
 * header and "John Smith" in the rows reached the model, because the list above
 * holds Indian names only and Indian companies' software is full of everyone
 * else's. Written from common given names worldwide — English, European,
 * Arabic, East Asian, African, Latin American — not from any page we test on.
 *
 * Left out on purpose: names that are also everyday interface words, where the
 * two-token rule would fire on buttons and headings rather than people — Mark
 * (as read), Will, Grace (period), Hope, Faith, Joy, May, June, April, August,
 * Rose, Bill (to), Art, Pat, Frank, Guy, Ray, Dawn, Summer, Max, Chase, Sterling,
 * Rich, Don, Sunny, Page, Victor(y), Amber, Crystal, Sky, Iris, Ivy, Jade, Holly.
 */
const GLOBAL_NAMES = [
  // English and European
  'aaron', 'adam', 'adrian', 'alan', 'albert', 'alex', 'alexander', 'alexandra', 'alice', 'alicia',
  'allison', 'amanda', 'amelia', 'amy', 'andrea', 'andrew', 'angela', 'anna', 'anne', 'anthony',
  'antonio', 'ashley', 'barbara', 'benjamin', 'brandon', 'brian', 'caroline', 'carlos', 'catherine', 'charles',
  'charlotte', 'chloe', 'chris', 'christina', 'christine', 'christopher', 'claire', 'cory', 'daniel', 'david',
  'deborah', 'dennis', 'diana', 'donald', 'dorothy', 'edward', 'elena', 'elizabeth', 'ella', 'emily',
  'emma', 'eric', 'ethan', 'eva', 'fiona', 'francesca', 'gary', 'george', 'hannah', 'harry',
  'heather', 'helen', 'henry', 'isabella', 'jacob', 'james', 'jane', 'janet', 'jason', 'jeffrey',
  'jennifer', 'jessica', 'joan', 'john', 'johnny', 'jonathan', 'joseph', 'joshua', 'julia', 'julie',
  'justin', 'karen', 'katherine', 'kathleen', 'kelly', 'kenneth', 'kevin', 'kimberly', 'laura', 'lauren',
  'linda', 'lisa', 'lucas', 'lucy', 'margaret', 'maria', 'marie', 'martin', 'mary', 'matthew',
  'megan', 'melissa', 'michael', 'michelle', 'nancy', 'natalie', 'nathan', 'nicholas', 'nicole', 'noah',
  'oliver', 'olivia', 'patricia', 'patrick', 'paul', 'peter', 'rachel', 'rebecca', 'richard', 'robert',
  'ronald', 'ryan', 'samantha', 'samuel', 'sandra', 'sarah', 'scott', 'sean', 'sharon', 'sophia',
  'sophie', 'stephanie', 'stephen', 'steven', 'susan', 'thomas', 'timothy', 'tim', 'tom', 'tyler',
  'victoria', 'william', 'zachary', 'hans', 'klaus', 'lukas', 'sven', 'ingrid', 'pierre', 'jean',
  'giulia', 'marco', 'luca', 'sofia', 'ivan', 'dmitri', 'olga', 'natalia', 'piotr', 'katarzyna',
  // Arabic, Persian, Turkish
  'ahmed', 'ahmad', 'ali', 'amir', 'aisha', 'fatima', 'hassan', 'hussein', 'ibrahim', 'khalid',
  'layla', 'mariam', 'mohammed', 'mohammad', 'muhammad', 'mustafa', 'omar', 'rashid', 'salma', 'yousef',
  'youssef', 'zainab', 'reza', 'mehmet', 'emre', 'elif',
  // East and South-East Asian (romanised)
  'wei', 'jing', 'li', 'ming', 'xiao', 'yan', 'hui', 'jun', 'hiroshi', 'kenji',
  'takashi', 'yuki', 'haruto', 'sakura', 'akira', 'minji', 'jisoo', 'seojun', 'thanh', 'linh',
  'nguyen', 'siti', 'nur', 'putri', 'budi',
  // African
  'kwame', 'kofi', 'ama', 'chinedu', 'ngozi', 'oluwaseun', 'tunde', 'amara', 'thabo', 'sipho',
  'zanele', 'wanjiru', 'otieno', 'abebe', 'desta',
  // Latin American and Iberian
  'alejandro', 'ana', 'camila', 'diego', 'fernando', 'gabriel', 'isabel', 'javier', 'jorge', 'jose',
  'juan', 'luis', 'lucia', 'manuel', 'mateo', 'miguel', 'pablo', 'pedro', 'rafael', 'valentina',
  'joao', 'thiago', 'beatriz',
] as const;

export const GIVEN_NAMES: ReadonlySet<string> = new Set([...NAMES, ...GLOBAL_NAMES]);

/**
 * Tokens that are on the list but are also ordinary words, so they are only
 * believed when a capitalised surname follows.
 *
 * `Raj`, `Dev`, `Om`, `Tara`, `Devi` and `Rani` all appear in ordinary Indian
 * English prose — place names, honorifics, common nouns. The two-token rule
 * already covers this, and they are named here so that a future change loosening
 * that rule has to decide about them deliberately rather than by accident.
 */
export const AMBIGUOUS_GIVEN_NAMES: ReadonlySet<string> = new Set([
  'raj',
  'dev',
  'om',
  'tara',
  'devi',
  'rani',
  'kiran',
  'asha',
  'prem',
  'ram',
]);
