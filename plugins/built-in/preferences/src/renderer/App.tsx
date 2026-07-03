export function App() {
    return (
        <div className="">
            {
                Array.from({ length: 100 }).map((_, index) => (
                    <div key={index} className="border-b border-gray-300 ">
                        <p className="">
                            设置项
                            {index + 1}
                        </p>
                    </div>
                ))
            }
        </div>
    );
}
